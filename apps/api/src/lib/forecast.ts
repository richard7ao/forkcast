import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { PANEL_SEGMENTS, Product, VariantsResponse, type Variant } from "@hack/contract";
import { PersonasFile, type ForecastFile, type PanelAnswer, type PanelSegment, type Persona } from "../data/files";
import { chatJson, mapLimit, MODELS, type ContentPart } from "./llm";
import { aggregate, personaOrder, pooledPick } from "./panel";
import { sealForecast } from "./seal";

/** 25 per segment keeps a segment's P(tap) in 4-point steps; 10 gave 10-point steps and ~16 points of noise. */
const PERSONAS_PER_SEGMENT = 25;
const MAX_PERSONAS_PER_CALL = 25;
const MAX_PERSONA_CALLS = 3;

/** Who each panel segment stands for; the voters are people at a London food event. */
const SEGMENT_BRIEF: Record<PanelSegment, string> = {
  student: "university students in London",
  young_pro: "young professionals in their 20s and early 30s working in London",
  parent: "London parents with children at home",
  fitness: "Londoners who train most weeks (gym, running, team sport)",
};

/** Keeps a synthetic panel's known positive skew in check; part of the method, do not soften. */
const REALISM =
  "You are scrolling Instagram on your phone. For EACH ad decide honestly whether you would tap it or scroll past. In real life most people scroll past most ads.";

/** data/product.json, or the fixture's product with placeholder: true until the frontend lane writes the real one. */
export function loadProduct(dir: string): { product: Product; placeholder: boolean } {
  const file = join(dir, "product.json");
  if (existsSync(file)) return { product: Product.parse(JSON.parse(readFileSync(file, "utf8"))), placeholder: false };
  const fixture = new URL("../../../../fixtures/variants.json", import.meta.url);
  return { product: VariantsResponse.parse(JSON.parse(readFileSync(fixture, "utf8"))).product, placeholder: true };
}

const PersonaDrafts = z.object({ personas: z.array(z.object({ name: z.string().min(1), bio: z.string().min(1) })).min(1) });
const personaDraftsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["personas"],
  properties: {
    personas: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["name", "bio"], properties: { name: { type: "string" }, bio: { type: "string" } } },
    },
  },
};

/** One segment's fictional personas, asked for in batches of at most MAX_PERSONAS_PER_CALL until the segment is full. */
async function segmentPersonas(segment: PanelSegment): Promise<Persona[]> {
  let drafts: z.infer<typeof PersonaDrafts>["personas"] = [];
  for (let call = 1; drafts.length < PERSONAS_PER_SEGMENT; call++) {
    if (call > MAX_PERSONA_CALLS) throw new Error(`only ${drafts.length} of ${PERSONAS_PER_SEGMENT} ${segment} personas after ${MAX_PERSONA_CALLS} calls`);
    const want = Math.min(PERSONAS_PER_SEGMENT - drafts.length, MAX_PERSONAS_PER_CALL);
    const { personas } = await chatJson({
      model: MODELS.copy,
      system:
        "You write fictional consumer personas for a synthetic ad-testing panel. Fictional first names only: no surnames, no real or famous people, no contact details.",
      user: [
        `Write exactly ${want} distinct personas who are ${SEGMENT_BRIEF[segment]}.`,
        'Each bio is 2-3 sentences in the second person ("You ...") covering: weekly food and snack budget, diet and eating habits, how they feel about ads and brands, and what they are usually doing when they scroll Instagram.',
        "Make them genuinely diverse: tight to comfortable budgets; strict diets, no particular diet and picky eaters; impulsive and sceptical; scrolling on the commute, in a queue, late at night, on a break. Avoid stereotypes and do not make everyone health-conscious.",
        drafts.length ? `Use names other than: ${drafts.map((d) => d.name).join(", ")}.` : "",
      ].join("\n"),
      name: "personas",
      jsonSchema: personaDraftsSchema,
      schema: PersonaDrafts,
    });
    drafts = [...drafts, ...personas.slice(0, want)];
  }
  return drafts.map((p, i) => ({ id: `${segment}-${i + 1}`, segment, name: p.name, bio: p.bio }));
}

/** personas.json when it exists; otherwise PERSONAS_PER_SEGMENT fictional personas per panel segment, saved and reused every round. */
export async function ensurePersonas(dir: string): Promise<Persona[]> {
  const file = join(dir, "personas.json");
  if (existsSync(file)) return PersonasFile.parse(JSON.parse(readFileSync(file, "utf8"))).personas;

  const personas = (await Promise.all(PANEL_SEGMENTS.map(segmentPersonas))).flat();
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${JSON.stringify({ personas } satisfies PersonasFile, null, 2)}\n`);
  return personas;
}

const Answers = z.object({ answers: z.array(z.object({ ad: z.string(), decision: z.enum(["tap", "scroll"]), reason: z.string() })) });
const answersSchema = (labels: string[]) => ({
  type: "object",
  additionalProperties: false,
  required: ["answers"],
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ad", "decision", "reason"],
        properties: { ad: { type: "string", enum: labels }, decision: { type: "string", enum: ["tap", "scroll"] }, reason: { type: "string" } },
      },
    },
  },
});

/** apps/web/public, where every ad image the voters see is served from. */
const PUBLIC_DIR = fileURLToPath(new URL("../../../web/public/", import.meta.url));
const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

/** A served ad image ("/generated/r1-value.png") as a base64 data URL. Throws when missing, so the panel never judges other creative than the room. */
function imageDataUrl(imageUrl: string): string {
  const file = resolve(PUBLIC_DIR, imageUrl.replace(/^\/+/, ""));
  const mime = MIME[extname(file).toLowerCase()];
  if (!file.startsWith(PUBLIC_DIR) || !mime) throw new Error(`unusable ad image ${imageUrl}`);
  if (!existsSync(file)) throw new Error(`missing ad image ${file}: render it before forecasting`);
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
}

/**
 * One persona's verdict on every ad, shown in its personaOrder as "Ad 1..n": variant ids name the
 * lever ("r1-scarcity"), so they never reach the model. With images (variantId -> data URL), each ad's
 * image sits between its label and its copy, as on the vote card. Re-asks once if any ad is missed or doubled.
 */
async function askPersona(
  persona: Persona,
  round: number,
  product: Product,
  variants: Variant[],
  model: string,
  images: Map<string, string> | null,
): Promise<PanelAnswer[]> {
  const order = personaOrder(persona.id, round, variants);
  const labels = order.map((_, i) => String(i + 1));
  const copy = (v: Variant) => `Headline: ${v.headline}\nBody: ${v.body}\nButton: ${v.cta}`;
  const outro = 'Answer every ad exactly once: ad (its number), decision ("tap" or "scroll"), reason (one short sentence in your own voice).';
  const user: string | ContentPart[] = images
    ? [
        { type: "text", text: `Every ad is from ${product.brand} (Sponsored). Each ad's image is shown with it.` },
        ...order.flatMap((v, i): ContentPart[] => {
          const url = images.get(v.id);
          const image = url ? [{ type: "image_url", image_url: { url, detail: "low" } } as ContentPart] : [];
          return [{ type: "text", text: `Ad ${labels[i]}` }, ...image, { type: "text", text: copy(v) }];
        }),
        { type: "text", text: outro },
      ]
    : [
        `Every ad is from ${product.brand} (Sponsored) and shows a photo of ${product.name}.`,
        ...order.map((v, i) => `\nAd ${labels[i]}\n${copy(v)}`),
        `\n${outro}`,
      ].join("\n");

  for (let attempt = 1; ; attempt++) {
    const { answers } = await chatJson({
      model,
      system: `You are ${persona.name}. ${persona.bio}\n\n${REALISM}`,
      user,
      name: "panel_answers",
      jsonSchema: answersSchema(labels),
      schema: Answers,
    });
    const answered = new Set(answers.map((a) => a.ad));
    if (answers.length === order.length && labels.every((label) => answered.has(label))) {
      return answers.map((a) => ({
        personaId: persona.id,
        segment: persona.segment,
        variantId: order[Number(a.ad) - 1]!.id,
        decision: a.decision,
        reason: a.reason,
      }));
    }
    if (attempt >= 2) throw new Error(`${persona.id} answered ads [${answers.map((a) => a.ad).join(",")}], not each of 1-${order.length} exactly once`);
  }
}

/**
 * Every persona judges every variant (concurrency-capped), seeing each variant's imageUrl when it has one;
 * P(tap) per segment, the pooled means and the pick are sealed together. If the panel model rejects images
 * (HTTP 400 on the first persona), the whole panel runs text-only and `warn` is told, so the caller can say so loudly.
 */
export async function runForecast(opts: {
  round: number;
  product: Product;
  variants: Variant[];
  personas: Persona[];
  model?: string;
  concurrency?: number;
  warn?: (message: string) => void;
}): Promise<ForecastFile> {
  const { round, product, variants, personas, model = MODELS.panel, concurrency = 8, warn } = opts;
  const counts = PANEL_SEGMENTS.map((segment) => personas.filter((p) => p.segment === segment).length);
  if (new Set(counts).size !== 1 || !counts[0]) throw new Error(`personas must be balanced across panel segments, got ${counts.join("/")}`);

  const withImage = variants.filter((v) => v.imageUrl);
  let images = withImage.length ? new Map(withImage.map((v) => [v.id, imageDataUrl(v.imageUrl!)])) : null;
  const ask = (persona: Persona, imgs: Map<string, string> | null) => askPersona(persona, round, product, variants, model, imgs);

  // The first persona doubles as a probe: a panel model that rejects images fails every call the same way,
  // so after a rejection `images` is dropped and the rest of the panel runs text-only.
  const [first, ...rest] = personas;
  const firstAnswers = await ask(first!, images).catch((err: unknown) => {
    if (!images || !String(err).includes("HTTP 400")) throw err;
    images = null;
    warn?.(`PANEL MODEL ${model} REJECTED IMAGES (${String(err).slice(0, 200)}): this forecast is TEXT-ONLY, unlike the ads voters see`);
    return ask(first!, null);
  });
  const answers = [...firstAnswers, ...(await mapLimit(rest, concurrency, (p) => ask(p, images))).flat()];
  const perSegment = aggregate(answers, variants);
  return sealForecast({ round, model, personasPerSegment: counts[0], perSegment, ...pooledPick(perSegment, variants), answers });
}
