// Writes DATA_DIR/variants/round-N.json: one ad per Lever, every number checked against the product facts.
// Usage (apps/api, after `set -a; . ../../.env; set +a`): node --import tsx scripts/generate.ts [--round 1] [--dry] [--force]
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { Lever, Variant } from "@hack/contract";
import { dataDir, type VariantsFile } from "../src/data/files";
import { loadProduct } from "../src/lib/forecast";
import { chatJson, MODELS, usageTotals } from "../src/lib/llm";
import { bannedClaims, inventedNumbers } from "../src/lib/truth";

const MAX_ATTEMPTS = 3; // the first ask plus 2 re-asks that list the exact violations

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { values } = parseArgs({
  options: { round: { type: "string", default: "1" }, dry: { type: "boolean", default: false }, force: { type: "boolean", default: false } },
});
const parsedRound = z.coerce.number().int().min(1).safeParse(values.round);
if (!parsedRound.success) fail("usage: generate.ts [--round N] [--dry] [--force]");
const round = parsedRound.data;
const dir = dataDir();
const out = join(dir, "variants", `round-${round}.json`);

if (!values.dry && !values.force && existsSync(join(dir, "forecasts", `round-${round}.json`))) {
  fail(`refusing: round ${round} is already sealed, so new variants would orphan its forecast. Use --force only if you will re-seal before any vote.`);
}

const { product, placeholder } = loadProduct(dir);
if (placeholder) console.error("\n!!! PLACEHOLDER PRODUCT: write data/product.json !!!\n");
/** Numbers in the copy must come from these: the facts, plus the price, name and brand the ad shows anyway. */
const allowed = [...product.facts, product.price, product.name, product.brand];

const LEVER_BRIEF: Record<Lever, string> = {
  social_proof: "other people already pick it and pass it round (the bag everyone grabs at a barbecue), with no counts, ratings, reviews or quotes",
  scarcity: "urgency: grab it now, don't miss out (no fake stock levels, limited editions or deadlines)",
  health_halo: "health and nutrition benefits, taken from the facts",
  indulgence: "taste, texture, pleasure, a treat",
  provenance: "where and how it is made",
  value: "what you get for your money: pack size and amount, plus the price only if one is given",
};

const brief = [
  `Product: ${product.brand} ${product.name}${product.price ? `, ${product.price}` : " (no price given: never state or imply one)"}.`,
  "Facts (true, read off the pack; the ONLY claims you may make):",
  ...product.facts.map((fact) => `- ${fact}`),
  "",
  "Write 6 Instagram feed ads, exactly one per persuasion lever, each leaning hard on its own lever so a test can tell them apart.",
  "Write like a sharp social copywriter: punchy, conversational, specific. The ad already shows the brand and the pack, so do not repeat the full product name.",
  ...Lever.options.map((lever) => `- ${lever}: ${LEVER_BRIEF[lever]}`),
  "",
  "Truth rule (real people will judge these ads):",
  "- Factual claims (numbers, awards, sales, stock, origin, nutrition, price) must come from the facts above. Subjective framing (pillowy, epic, the bag everyone grabs) is fine.",
  "- No invented numbers, statistics, reviews, ratings, awards or endorsements. Social proof and scarcity must work without fabricated stats or fake stock claims.",
  "- Use digits only for numbers that appear in the facts or the product name. Never spell numbers out: no one to twenty, hundred, thousand or million, not even \"the one\".",
  '- Never write: best-selling, award, award-winning, #1, number one, most popular, loved by, favourite of, voted, limited edition, limited batch, small batch, selling fast, sold out, only a few left, while stocks last, vegan, vegetarian, plant-based.',
  "",
  "Limits: headline at most 60 characters, body at most 160, cta at most 20 (a short button label). rationale: one sentence on how the copy expresses its lever and which facts it uses.",
].join("\n");

const Drafts = z.object({ variants: z.array(z.object({ lever: Lever, headline: z.string(), body: z.string(), cta: z.string(), rationale: z.string() })) });
type Draft = z.infer<typeof Drafts>["variants"][number];
const draftsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["variants"],
  properties: {
    variants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["lever", "headline", "body", "cta", "rationale"],
        properties: {
          lever: { type: "string", enum: Lever.options },
          headline: { type: "string" },
          body: { type: "string" },
          cta: { type: "string" },
          rationale: { type: "string" },
        },
      },
    },
  },
};

const toVariant = (d: Draft): Variant => ({ id: `r${round}-${d.lever}`, round, ...d, parentId: null });

/** Every rule a draft set breaks: each lever exactly once, a valid Variant, no number missing from the facts, no banned claim. */
function violations(drafts: Draft[]): string[] {
  const coverage = Lever.options.flatMap((lever) => {
    const n = drafts.filter((d) => d.lever === lever).length;
    return n === 1 ? [] : [`lever ${lever} appears ${n} times; need exactly 1`];
  });
  const perDraft = drafts.flatMap((d) => {
    const copy = `${d.headline} ${d.body} ${d.cta}`;
    const invented = inventedNumbers(copy, allowed);
    const banned = bannedClaims(copy);
    return [
      ...(Variant.safeParse(toVariant(d)).error?.issues.map((issue) => `${d.lever} ${issue.path.join(".")}: ${issue.message}`) ?? []),
      ...(invented.length ? [`${d.lever}: numbers not in the facts: ${invented.join(", ")}`] : []),
      ...(banned.length ? [`${d.lever}: banned words: ${banned.join(", ")}`] : []),
    ];
  });
  return [...coverage, ...perDraft];
}

let feedback = "";
for (let attempt = 1; ; attempt++) {
  const { variants: drafts } = await chatJson({
    model: MODELS.copy,
    system: "You write short, distinct Instagram ad copy for a food concept test. Every claim must be true.",
    user: brief + feedback,
    name: "ad_variants",
    jsonSchema: draftsSchema,
    schema: Drafts,
  });
  const problems = violations(drafts);
  if (problems.length === 0) {
    const file: VariantsFile = { round, variants: Lever.options.map((lever) => toVariant(drafts.find((d) => d.lever === lever)!)) };
    if (values.dry) console.log(JSON.stringify(file, null, 2));
    else {
      mkdirSync(join(dir, "variants"), { recursive: true });
      writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`);
    }
    for (const v of file.variants) console.log(`${v.lever.padEnd(12)} ${v.headline} | ${v.body} | ${v.cta}`);
    console.log(`${values.dry ? "dry run, nothing written" : `wrote ${out}`} after ${attempt} attempt(s); usage ${JSON.stringify(usageTotals)}`);
    break;
  }
  console.error(`attempt ${attempt}: ${problems.length} violation(s)\n  ${problems.join("\n  ")}`);
  if (attempt >= MAX_ATTEMPTS) fail(`giving up after ${attempt} attempts; nothing written. usage ${JSON.stringify(usageTotals)}`);
  feedback = [
    "\n\nYour previous attempt broke these rules. Fix every one and return all 6 ads again:",
    ...problems.map((p) => `- ${p}`),
    `Previous attempt: ${JSON.stringify(drafts)}`,
  ].join("\n");
}
