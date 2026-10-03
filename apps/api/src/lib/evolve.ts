import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { Lever, PANEL_SEGMENTS, Variant, type Ad, type CampaignStage, type Generation, type Product } from "@hack/contract";
import { SegmentProbabilities, type PanelSegment, type Persona } from "../data/files";
import { editProductImage, HERO_PROMPT } from "./image";
import { chatJson, mapLimit, MODELS } from "./llm";
import { pickMutations, type RenderCache } from "./renderCache";
import { canonicalJson } from "./seal";
import { READING_JSON_SCHEMA, READING_SYSTEM, Reading, slugify } from "./shelf";
import { SIM_CTR_SCALE, simulateDelivery } from "./simulate";
import { postStratify, seededRandom, wilson } from "./stats";
import { bannedClaims, inventedNumbers } from "./truth";

/**
 * The evolution engine: genome = { lever, scene, headline, body, cta }; image = render(scene, source photo).
 * gen0 writes 8 scenes x 6 levers, screen asks a text-only AI panel, runExperiment simulates Meta-style
 * delivery and keeps the fittest, breed mutates the survivors. All copy passes the truth guard.
 */
export const SCENES = 8;
export const SURVIVORS = 6;
export const PER_LEVER = 2;
const COPY_MUTATIONS = 3;
const PANEL_PER_SEGMENT = 10;
const ADS_PER_PERSONA = 12;
const MAX_COPY_ATTEMPTS = 3; // the first ask plus 2 re-asks that list the exact violations
const RENDER_CONCURRENCY = 4; // medium quality is ~36 s an image
const PANEL_CONCURRENCY = 8;

export type Progress = (stage: CampaignStage, label: string, done: number, total: number) => void;

/** A stable 32-bit seed from text ("<campaign>:<gen>"), so a generation replays identically. */
export const seedOf = (text: string) => createHash("sha256").update(text).digest().readUInt32BE(0);

// ---- reading the pack ----

export async function readPack(jpeg: Buffer, imageUrl: string): Promise<Product> {
  const r = await chatJson({
    model: MODELS.copy,
    system: READING_SYSTEM,
    user: [
      { type: "text", text: "Read this pack." },
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } },
    ],
    name: "pack_reading",
    jsonSchema: READING_JSON_SCHEMA,
    schema: Reading,
  });
  if (!r.brand && !r.name) throw new Error(`could not read a product on this image${r.notes ? ` (${r.notes})` : ""}`);
  return { brand: r.brand, name: r.name, price: r.price, imageUrl, facts: r.facts };
}

/**
 * Catalog enrichment: photo reading + brand catalog. One photo shows one side of a pack; when the catalog
 * (DATA_DIR/product.json today, Shopify product data later) holds the same pack by name, its checked facts
 * (e.g. the back label's) and its brand and name spelling join the facts only this photo shows.
 * Returns `read` itself when nothing matches.
 */
export function enrichFromCatalog(read: Product, catalog: Product | null): Product {
  if (!catalog || slugify("", catalog.name) !== slugify("", read.name)) return read;
  const seen = new Set(catalog.facts.map((fact) => fact.toLowerCase()));
  return { ...catalog, price: catalog.price || read.price, imageUrl: read.imageUrl, facts: [...catalog.facts, ...read.facts.filter((fact) => !seen.has(fact.toLowerCase()))] };
}

// ---- copy and scenes (prompts as scripts/generate.ts) ----

const LEVER_BRIEF: Record<Lever, string> = {
  social_proof: "other people already pick it and share it round, with no counts, ratings, reviews or quotes",
  scarcity: "urgency: grab it now, don't miss out (no fake stock levels, limited editions or deadlines)",
  health_halo: "health and nutrition benefits, taken from the facts",
  indulgence: "taste, texture, pleasure, a treat",
  provenance: "where and how it is made",
  value: "what you get for your money: pack size and amount, plus the price only if one is given",
};

const TRUTH_RULES = [
  "Write like a sharp social copywriter: punchy, conversational, specific. The ad already shows the brand and the pack, so do not repeat the full product name.",
  "Truth rule (real people will judge these ads):",
  "- Factual claims (numbers, awards, sales, stock, origin, nutrition, price) must come from the facts above. Subjective framing (pillowy, epic, the bag everyone grabs) is fine.",
  "- No invented numbers, statistics, reviews, ratings, awards or endorsements. Social proof and scarcity must work without fabricated stats or fake stock claims.",
  '- Use digits only for numbers that appear in the facts or the product name. Never spell numbers out: no one to twenty, hundred, thousand or million, not even "the one".',
  "- Never write: best-selling, award, award-winning, #1, number one, most popular, loved by, favourite of, voted, limited edition, limited batch, small batch, selling fast, sold out, only a few left, while stocks last, vegan, vegetarian, plant-based.",
  "Limits: headline at most 60 characters, body at most 160, cta at most 20 (a short button label). rationale: one sentence on how the copy expresses its lever and which facts it uses.",
];

const SCENE_RULES =
  "Each scene is one sentence: setting, props, light and composition. The pack stays exactly as it is, front label to camera. No people's faces (a hand at most), and no text other than the pack's own.";

const productBrief = (p: Product) =>
  [
    `Product: ${p.brand} ${p.name}${p.price ? `, ${p.price}` : " (no price given: never state or imply one)"}.`,
    "Facts (true, read off the pack; the ONLY claims you may make):",
    ...p.facts.map((fact) => `- ${fact}`),
  ].join("\n");

const strictObject = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const Scenes = z.object({ scenes: z.array(z.string().min(1)) });
const scenesSchema = strictObject({ scenes: { type: "array", items: { type: "string" } } });
const Line = z.object({ headline: z.string(), body: z.string(), cta: z.string(), rationale: z.string() });
type Line = z.infer<typeof Line>;
const Lines = z.object({ ads: z.array(Line) });
const linesSchema = strictObject({
  ads: { type: "array", items: strictObject({ headline: { type: "string" }, body: { type: "string" }, cta: { type: "string" }, rationale: { type: "string" } }) },
});

async function askScenes(product: Product, task: string, n: number): Promise<string[]> {
  for (let attempt = 1; ; attempt++) {
    const { scenes } = await chatJson({
      model: MODELS.copy,
      system: "You art-direct product photography for Instagram food ads.",
      user: [productBrief(product), "", task, SCENE_RULES].join("\n"),
      name: "ad_scenes",
      jsonSchema: scenesSchema,
      schema: Scenes,
    });
    if (scenes.length >= n) return scenes.slice(0, n);
    if (attempt >= 2) throw new Error(`asked for ${n} scenes, got ${scenes.length}`);
  }
}

const copyLimits = Variant.pick({ headline: true, body: true, cta: true });

/** Every rule a set of lines breaks: the count, the contract's length limits, numbers missing from the facts, banned claims. */
export function copyViolations(lines: readonly Line[], n: number, product: Product): string[] {
  const allowed = [...product.facts, product.price, product.name, product.brand];
  return [
    ...(lines.length === n ? [] : [`need exactly ${n} ads, got ${lines.length}`]),
    ...lines.flatMap((line, i) => {
      const copy = `${line.headline} ${line.body} ${line.cta}`;
      const invented = inventedNumbers(copy, allowed);
      const banned = bannedClaims(copy);
      return [
        ...(copyLimits.safeParse(line).error?.issues.map((issue) => `ad ${i + 1} ${issue.path.join(".")}: ${issue.message}`) ?? []),
        ...(invented.length ? [`ad ${i + 1}: numbers not in the facts: ${invented.join(", ")}`] : []),
        ...(banned.length ? [`ad ${i + 1}: banned words: ${banned.join(", ")}`] : []),
      ];
    }),
  ];
}

/** n guarded lines of copy; re-asks with the exact violations, and throws rather than ship an untrue ad. */
async function askLines(product: Product, task: string, n: number): Promise<Line[]> {
  let feedback = "";
  for (let attempt = 1; ; attempt++) {
    const { ads } = await chatJson({
      model: MODELS.copy,
      system: "You write short, distinct Instagram ad copy for a food concept test. Every claim must be true.",
      user: [productBrief(product), "", task, "", ...TRUTH_RULES].join("\n") + feedback,
      name: "ad_copy",
      jsonSchema: linesSchema,
      schema: Lines,
    });
    const problems = copyViolations(ads, n, product);
    if (problems.length === 0) return ads;
    if (attempt >= MAX_COPY_ATTEMPTS) throw new Error(`copy still breaks the truth rules after ${attempt} attempts: ${problems.join("; ")}`);
    feedback = [
      "\n\nYour previous attempt broke these rules. Fix every one and return all the ads again:",
      ...problems.map((p) => `- ${p}`),
      `Previous attempt: ${JSON.stringify(ads)}`,
    ].join("\n");
  }
}

/** Renders each scene from the source photo with HERO_PROMPT's packaging-fidelity rules; returns served URLs. */
async function renderScenes(opts: {
  label: string;
  photo: Buffer;
  scenes: readonly string[];
  names: readonly string[];
  outDir: string;
  urlPrefix: string;
  onProgress: Progress;
}): Promise<{ urls: string[]; tokens: number }> {
  let done = 0;
  opts.onProgress("rendering", opts.label, done, opts.scenes.length);
  await mkdir(opts.outDir, { recursive: true });
  const rendered = await mapLimit([...opts.scenes], RENDER_CONCURRENCY, async (scene, i) => {
    const { png, usage } = await editProductImage({ photo: opts.photo, prompt: `${HERO_PROMPT} Scene: ${scene}` });
    await writeFile(join(opts.outDir, `${opts.names[i]}.png`), png);
    opts.onProgress("rendering", opts.label, ++done, opts.scenes.length);
    return { url: `${opts.urlPrefix}/${opts.names[i]}.png`, tokens: usage?.total_tokens ?? 0 };
  });
  return { urls: rendered.map((r) => r.url), tokens: rendered.reduce((sum, r) => sum + r.tokens, 0) };
}

/** Stands in for renderScenes on a cache hit, holding the label for one 2 s poll so the reuse is shown, not hidden. */
async function cachedRenders(onProgress: Progress, label: string, urls: string[]): Promise<{ urls: string[]; tokens: number }> {
  onProgress("rendering", label, urls.length, urls.length);
  await sleep(2000);
  return { urls, tokens: 0 };
}

type Genome = Pick<Ad, "id" | "gen" | "parentIds" | "lever" | "scene" | "imageUrl" | "headline" | "body" | "cta" | "rationale">;
const newAd = (g: Genome): Ad => ({
  ...g,
  round: g.gen + 1,
  parentId: g.parentIds[0] ?? null,
  fitness: { ai: null, human: null },
  experiment: null,
  status: "screening",
});

type Opts = { product: Product; photo: Buffer; outDir: string; urlPrefix: string; onProgress: Progress };

/** Gen 0: 8 scenes x 6 levers = 48 ads; line i of each lever's copy is written for scene i. A known photo never gets here: it replays (campaigns.ts). */
export async function gen0({ product, photo, outDir, urlPrefix, onProgress }: Opts): Promise<{ ads: Ad[]; imageTokens: number }> {
  const calls = 1 + Lever.options.length;
  let written = 0;
  onProgress("writing", "Writing scenes", written, calls);
  const scenes = await askScenes(
    product,
    `Write exactly ${SCENES} distinct scenes for square Instagram ads of this pack, each a different setting and mood that suits how people really eat or use it.`,
    SCENES,
  );
  onProgress("writing", "Writing copy for 6 levers", ++written, calls);
  const copy = await mapLimit([...Lever.options], Lever.options.length, async (lever) => {
    const task = [
      `Persuasion lever: ${lever}: ${LEVER_BRIEF[lever]}.`,
      `Write exactly ${SCENES} Instagram feed ads that all lean hard on this lever, in this order: ad i runs with scene i as its image.`,
      "Make them genuinely different from each other: hook, angle and rhythm.",
      ...scenes.map((scene, i) => `Scene ${i + 1}: ${scene}`),
    ].join("\n");
    const lines = await askLines(product, task, SCENES);
    onProgress("writing", "Writing copy for 6 levers", ++written, calls);
    return lines;
  });

  const images = await renderScenes({
    label: "Rendering scenes",
    photo,
    scenes,
    names: scenes.map((_, i) => `scene-${i}`),
    outDir,
    urlPrefix,
    onProgress,
  });
  const ads = Lever.options.flatMap((lever, l) =>
    scenes.map((scene, i) => newAd({ id: `g0-${lever}-${i}`, gen: 0, parentIds: [], lever, scene, imageUrl: images.urls[i], ...copy[l]![i]! })),
  );
  return { ads, imageTokens: images.tokens };
}

/**
 * Each survivor gets 3 copy mutations (same lever and image, new headline and body) and 1 scene mutation
 * (a re-rendered scene variation, same copy): 6 survivors give 24 children.
 */
export async function breed({ gen, survivors, product, photo, outDir, urlPrefix, onProgress, cache }: Opts & { gen: number; survivors: readonly Ad[]; cache?: RenderCache | null }): Promise<{ ads: Ad[]; imageTokens: number }> {
  const childId = (s: Ad, suffix: string) => `${s.id.replace(/^g\d+-/, `g${gen}-`)}-${suffix}`;
  const calls = survivors.length + 1;
  let written = 0;
  const tick = <T>(value: T) => (onProgress("writing", "Breeding copy and scene mutations", ++written, calls), value);
  onProgress("writing", "Breeding copy and scene mutations", written, calls);
  const [variations, mutations] = await Promise.all([
    askScenes(
      product,
      ["For each numbered scene, write one new variation: the same idea in a different setting, angle or light. Keep the order.", ...survivors.map((s, i) => `Scene ${i + 1}: ${s.scene}`)].join("\n"),
      survivors.length,
    ).then(tick),
    mapLimit([...survivors], survivors.length, (s) =>
      askLines(
        product,
        [
          `This ad survived a simulated test. Persuasion lever: ${s.lever}: ${LEVER_BRIEF[s.lever]}.`,
          `Its image: ${s.scene}`,
          `Headline: ${s.headline}\nBody: ${s.body}\nButton: ${s.cta}`,
          `Write exactly ${COPY_MUTATIONS} mutations of it: the same lever and button, a new headline and body each. Keep what works; change the hook, angle or rhythm.`,
        ].join("\n"),
        COPY_MUTATIONS,
      ).then(tick),
    ),
  ]);

  // A survivor whose scene already has a cached variation reuses it (scene text and render together); the rest render live.
  const cached = pickMutations(survivors.map((s) => s.scene), cache?.mutations);
  const live = survivors.flatMap((_, k) => (cached[k] ? [] : [k]));
  const reused = survivors.length - live.length;
  const images = live.length
    ? await renderScenes({
        label: reused ? `Rendering ${live.length} scene mutations (${reused} reused)` : "Rendering scene mutations",
        photo,
        scenes: live.map((k) => variations[k]!),
        names: live.map((k) => childId(survivors[k]!, "s1")),
        outDir,
        urlPrefix,
        onProgress,
      })
    : await cachedRenders(onProgress, `Reused ${reused} scene mutation renders of this photo: no image generation`, cached.map((m) => m!.imageUrl));
  const ads = survivors.flatMap((s, k) => [
    ...mutations[k]!.map((line, j) => newAd({ ...s, ...line, id: childId(s, `c${j + 1}`), gen, parentIds: [s.id] })),
    newAd({
      ...s,
      id: childId(s, "s1"),
      gen,
      parentIds: [s.id],
      scene: cached[k]?.scene ?? variations[k]!,
      imageUrl: cached[k]?.imageUrl ?? images.urls[live.indexOf(k)],
      rationale: `Scene mutation of ${s.id}: same copy, new scene.`,
    }),
  ]);
  return { ads, imageTokens: images.tokens };
}

// ---- screening: a text-only AI panel ----

/** Same line as lib/forecast.ts: keeps a synthetic panel's known positive skew in check. */
const REALISM =
  "You are scrolling Instagram on your phone. For EACH ad decide honestly whether you would tap it or scroll past. In real life most people scroll past most ads.";

function shuffled<T>(xs: readonly T[], rand: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Who sees what: 10 personas per segment, each shown 12 distinct ads. A segment's ads are dealt from
 * successive shuffles, so every ad reaches every segment whenever 10 x 12 >= the number of ads.
 */
export function screeningPlan(adIds: readonly string[], personas: readonly Persona[], seed: number): { persona: Persona; adIds: string[] }[] {
  const rand = seededRandom(seed);
  const per = Math.min(ADS_PER_PERSONA, adIds.length);
  return PANEL_SEGMENTS.flatMap((segment) => {
    const panel = shuffled(personas.filter((p) => p.segment === segment), rand).slice(0, PANEL_PER_SEGMENT);
    const deck: string[] = [];
    while (deck.length < panel.length * per) deck.push(...shuffled(adIds, rand));
    return panel.map((persona, i) => ({ persona, adIds: [...new Set(deck.slice(i * per, (i + 1) * per))] }));
  });
}

type ScreenAnswer = { adId: string; segment: PanelSegment; tap: boolean };

/** Pooled Rate and per-segment P(tap) per ad. ponytail: an empty segment cell borrows the pooled rate; only reachable past 120 ads. */
export function tally(answers: readonly ScreenAnswer[], adIds: readonly string[]): Record<string, Ad["fitness"]> {
  return Object.fromEntries(
    adIds.map((id) => {
      const mine = answers.filter((a) => a.adId === id);
      const ai = wilson(mine.filter((a) => a.tap).length, mine.length);
      const aiBySegment = Object.fromEntries(
        PANEL_SEGMENTS.map((segment) => {
          const cell = mine.filter((a) => a.segment === segment);
          return [segment, cell.length ? cell.filter((a) => a.tap).length / cell.length : (ai.rate ?? 0)];
        }),
      );
      return [id, { ai, human: null, aiBySegment }];
    }),
  );
}

const Answers = z.object({ answers: z.array(z.object({ ad: z.string(), decision: z.enum(["tap", "scroll"]), reason: z.string() })) });
const answersSchema = (labels: string[]) =>
  strictObject({
    answers: { type: "array", items: strictObject({ ad: { type: "string", enum: labels }, decision: { type: "string", enum: ["tap", "scroll"] }, reason: { type: "string" } }) },
  });

/** One persona's tap/scroll on its ads, as neutral "Ad N" labels; the image is described in words. Re-asks once if any ad is missed or doubled. */
async function askScreen(persona: Persona, product: Product, ads: readonly Ad[]): Promise<ScreenAnswer[]> {
  const labels = ads.map((_, i) => String(i + 1));
  const user = [
    `Every ad is from ${product.brand} (Sponsored) and shows ${product.name}. Each ad's image is described in words.`,
    ...ads.map((a, i) => `\nAd ${labels[i]}\nImage: ${a.scene}\nHeadline: ${a.headline}\nBody: ${a.body}\nButton: ${a.cta}`),
    '\nAnswer every ad exactly once: ad (its number), decision ("tap" or "scroll"), reason (one short sentence in your own voice).',
  ].join("\n");
  for (let attempt = 1; ; attempt++) {
    const { answers } = await chatJson({
      model: MODELS.panel,
      system: `You are ${persona.name}. ${persona.bio}\n\n${REALISM}`,
      user,
      name: "panel_answers",
      jsonSchema: answersSchema(labels),
      schema: Answers,
    });
    const answered = new Set(answers.map((a) => a.ad));
    if (answers.length === ads.length && labels.every((label) => answered.has(label))) {
      return answers.map((a) => ({ adId: ads[Number(a.ad) - 1]!.id, segment: persona.segment, tap: a.decision === "tap" }));
    }
    if (attempt >= 2) throw new Error(`${persona.id} did not answer each of ads 1-${ads.length} exactly once`);
  }
}

/** Fills fitness.ai and fitness.aiBySegment for these ads from a 40-persona text panel. */
export async function screen(opts: { ads: readonly Ad[]; product: Product; personas: readonly Persona[]; seed: number; onProgress: Progress }): Promise<Ad[]> {
  const { ads, product, personas, seed, onProgress } = opts;
  const byId = new Map(ads.map((a) => [a.id, a]));
  const plan = screeningPlan([...byId.keys()], personas, seed);
  let done = 0;
  onProgress("screening", "AI shopper panel", done, plan.length);
  const answers = await mapLimit(plan, PANEL_CONCURRENCY, async ({ persona, adIds }) => {
    const out = await askScreen(persona, product, adIds.map((id) => byId.get(id)!));
    onProgress("screening", "AI shopper panel", ++done, plan.length);
    return out;
  });
  const fitness = tally(answers.flat(), [...byId.keys()]);
  return ads.map((a) => ({ ...a, fitness: fitness[a.id]! }));
}

// ---- simulated experiment, selection, seal ----

/** The simulation's click probability: equal-weight panel P(tap) across segments x SIM_CTR_SCALE. */
export const trueRate = (ad: Ad) => postStratify(SegmentProbabilities.parse(ad.fitness.aiBySegment), {}) * SIM_CTR_SCALE;

const posterior = (a: Ad) => (a.experiment ? (a.experiment.clicks + 1) / (a.experiment.impressions + 2) : 0);

/** Top n ids by posterior mean CTR, at most perLever per lever so the next generation stays diverse. Ties go to the lower id. */
export function select(ads: readonly Ad[], n = SURVIVORS, perLever = PER_LEVER): string[] {
  const ranked = [...ads].sort((a, b) => posterior(b) - posterior(a) || a.id.localeCompare(b.id));
  const taken = new Map<string, number>();
  return ranked
    .filter((a) => {
      taken.set(a.lever, (taken.get(a.lever) ?? 0) + 1);
      return taken.get(a.lever)! <= perLever;
    })
    .slice(0, n)
    .map((a) => a.id);
}

/** Simulated delivery of one generation, then selection. Gen 0 only picks survivors; later generations crown a winner. */
export function runExperiment(gen: number, ads: readonly Ad[], seed: number): Pick<Generation, "ads" | "survivorIds" | "timeline"> {
  const { byAd, timeline } = simulateDelivery(ads.map((a) => ({ id: a.id, trueRate: trueRate(a) })), { seed });
  const tested = ads.map((a) => ({ ...a, experiment: byAd[a.id]! }));
  const survivorIds = select(tested);
  const status = (id: string): Ad["status"] => {
    if (gen > 0 && id === survivorIds[0]) return "winner";
    return survivorIds.includes(id) ? "survivor" : "culled";
  };
  return { ads: tested.map((a) => ({ ...a, status: status(a.id) })), survivorIds, timeline };
}

/** sha256 of the generation's canonical fitness table: each ad's genome, what the panel said and what delivery did. */
export function sealGeneration(gen: number, ads: readonly Ad[]): string {
  const table = ads.map(({ id, lever, scene, headline, body, cta, imageUrl, fitness, experiment }) => ({ id, lever, scene, headline, body, cta, imageUrl, fitness, experiment }));
  return createHash("sha256").update(canonicalJson({ gen, ads: table })).digest("hex");
}
