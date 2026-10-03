import { z } from "zod";
import { Lever, Variant, type Cell, type Product, type ResultsResponse, type VariantResult } from "@hack/contract";
import { chatJson, MODELS } from "./llm";
import { bannedClaims, inventedNumbers } from "./truth";

/** Below this many votes a rate claims nothing (the same bar as results.ts). */
const MIN_N = 10;
const MAX_ATTEMPTS = 3; // the first ask plus 2 re-asks that list the exact violations
const MIN_ADMIN_TOKEN_LENGTH = 16;
/** Briefly public in .env.example, so it must never unlock anything. */
const PLACEHOLDER_ADMIN_TOKEN = "change-me";

/** False for a missing, short or placeholder ADMIN_TOKEN: the challenger then refuses every request, whatever it sends. */
export function adminTokenConfigured(token: string | undefined): token is string {
  return token !== undefined && token.length >= MIN_ADMIN_TOKEN_LENGTH && token !== PLACEHOLDER_ADMIN_TOKEN;
}

export type Evidence = {
  /** Round-1 human winner: highest pooled tap rate among variants with n >= 10; null below that bar. */
  winner: Variant | null;
  /** Pooled human tap rate with its 90% interval, best first, n >= 10 only. */
  ranking: { variantId: string; lever: Lever; rate: number; lo: number; hi: number; n: number }[];
  /** Segment cells that clear the n >= 10 bar; thinner cells claim nothing. */
  segmentCells: Cell[];
  /** Variants whose sealed AI forecast fell outside the human 90% interval. */
  aiMisses: VariantResult[];
};

/** Pure: the round-1 evidence a challenger may use. Anything under n = 10 is dropped here, so the prompt never sees it. */
export function buildEvidence(results: ResultsResponse, round1: readonly Variant[]): Evidence {
  const ids = new Set(round1.map((v) => v.id));
  const variants = results.variants.filter((r) => ids.has(r.variantId));
  const ranking = variants
    .flatMap(({ variantId, lever, human: { rate, lo, hi, n } }) =>
      n >= MIN_N && rate !== null && lo !== null && hi !== null ? [{ variantId, lever, rate, lo, hi, n }] : [],
    )
    .sort((a, b) => b.rate - a.rate); // stable, so ties keep round order, as the scorecard's humanWinnerId does
  return {
    winner: round1.find((v) => v.id === ranking[0]?.variantId) ?? null,
    ranking,
    segmentCells: results.cells.filter((c) => ids.has(c.variantId) && c.enough),
    aiMisses: variants.filter((r) => r.aiInsideCi === false),
  };
}

const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 100)}%`);
const rateText = (r: { rate: number | null; lo: number | null; hi: number | null; n: number }) =>
  `${pct(r.rate)} tap (90% CI ${pct(r.lo)}-${pct(r.hi)}, n ${r.n})`;

/**
 * The copy model's brief: round-1 evidence (n >= 10 only) and the truth rule. Both challengers stay on the winner's
 * lever, and only the winner's segments are shown, so nothing invites a second lever into the ad. Throws without a winner.
 */
export function challengerPrompt(evidence: Evidence, product: Product): { system: string; user: string } {
  const { winner, ranking, segmentCells, aiMisses } = evidence;
  if (!winner) throw new Error("no round-1 human winner (no variant with n >= 10) to challenge");
  const winnerCells = segmentCells.filter((c) => c.variantId === winner.id).sort((a, b) => (a.human.rate ?? 0) - (b.human.rate ?? 0));
  const user = [
    `Product: ${product.brand} ${product.name}${product.price ? `, ${product.price}` : " (no price given: never state or imply one)"}.`,
    "Facts (true, read off the pack; the ONLY claims the ad copy may make):",
    ...product.facts.map((fact) => `- ${fact}`),
    "",
    "Round 1: real people at a London food event saw one ad per persuasion lever and chose tap or scroll past.",
    "Pooled tap rate, best first (only ads with n >= 10):",
    ...ranking.map((r, i) => `${i + 1}. ${r.variantId} (${r.lever}): ${rateText(r)}`),
    "",
    `Human winner: ${winner.id} (${winner.lever})`,
    `  Headline: ${winner.headline}`,
    `  Body: ${winner.body}`,
    `  Button: ${winner.cta}`,
    `  How it uses ${winner.lever}: ${winner.rationale}`,
    "The winner by segment, weakest first (only segments with n >= 10; thinner ones are too small to act on):",
    ...(winnerCells.length ? winnerCells.map((c) => `- ${c.segment}: ${rateText(c.human)}`) : ["- none yet, so both challengers use option (b)"]),
    "",
    "Where the sealed AI forecast missed (outside the people's 90% CI):",
    ...(aiMisses.length ? aiMisses.map((r) => `- ${r.variantId} (${r.lever}): AI ${pct(r.ai)} vs people ${rateText(r.human)}`) : ["- none"]),
    "",
    `Write exactly 2 challenger ads, c1 and c2, to beat the winner in round 2. Both stay on the winner's lever, ${winner.lever}, and only that lever: do not mix in ${Lever.options.filter((l) => l !== winner.lever).join(", ")}. Each one either:`,
    "(a) rewrites the winner to win over its weakest segment, or",
    `(b) sharpens the winner's execution of ${winner.lever} for everyone.`,
    "Make c1 and c2 clearly different from each other and from the winner.",
    "Write like a sharp social copywriter: punchy, conversational, specific. The ad already shows the brand and the pack, so do not repeat the full product name.",
    "",
    // The truth rule as generate.ts states it, so round 2 is held to the same bar as round 1.
    "Truth rule (real people will judge these ads):",
    "- Factual claims (numbers, awards, sales, stock, origin, nutrition, price) must come from the facts above. Subjective framing (pillowy, epic, the bag everyone grabs) is fine.",
    "- No invented numbers, statistics, reviews, ratings, awards or endorsements. Social proof and scarcity must work without fabricated stats or fake stock claims.",
    '- Use digits only for numbers that appear in the facts or the product name. Never spell numbers out: no one to twenty, hundred, thousand or million, not even "the one".',
    "- Never write: best-selling, award, award-winning, #1, number one, most popular, loved by, favourite of, voted, limited edition, limited batch, small batch, selling fast, sold out, only a few left, while stocks last, vegan, vegetarian, plant-based.",
    "- Round-1 results never go in the ad copy; they belong in the rationale.",
    "",
    "Limits: headline at most 60 characters, body at most 160, cta at most 20 (a short button label).",
    "rationale: 1-2 sentences: which option (a or b) and why, citing the exact round-1 numbers above that you used.",
  ].join("\n");
  return {
    system: "You design round-2 challenger ads for a live food-ad concept test from real round-1 results. Short, distinct Instagram copy; every claim must be true.",
    user,
  };
}

/** What the copy model writes per challenger. No lever: buildRound2 gives every arm the winner's, so the model can't pick another. */
const Draft = z.object({ headline: z.string(), body: z.string(), cta: z.string(), rationale: z.string() });
export type Challenger = z.infer<typeof Draft>;
const Reply = z.object({ c1: Draft, c2: Draft });
const draftSchema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "body", "cta", "rationale"],
  properties: { headline: { type: "string" }, body: { type: "string" }, cta: { type: "string" }, rationale: { type: "string" } },
};
/** Two named slots instead of an array, so strict output always holds exactly 2 challengers. */
const replySchema = { type: "object", additionalProperties: false, required: ["c1", "c2"], properties: { c1: draftSchema, c2: draftSchema } };

const Copy = Variant.pick({ headline: true, body: true, cta: true });

/**
 * Every rule a challenger set breaks, as generate.ts checks round 1 (length limits, numbers missing from the facts,
 * banned claims), plus a headline repeated from the winner or the other challenger. Empty = safe to show people.
 */
export function challengerViolations(challengers: readonly Challenger[], product: Product, winner: Pick<Variant, "headline">): string[] {
  // As generate.ts: numbers may come from the facts, plus the price, name and brand the ad shows anyway.
  const allowed = [...product.facts, product.price, product.name, product.brand];
  // Index 0 is the winner, so challenger i sits at i + 1; an earlier equal headline means voters would see a repeat.
  const headlines = [winner, ...challengers].map((v) => v.headline.trim().toLowerCase());
  return challengers.flatMap((ch, i) => {
    const label = `c${i + 1}`;
    const copy = `${ch.headline} ${ch.body} ${ch.cta}`;
    const invented = inventedNumbers(copy, allowed);
    const banned = bannedClaims(copy);
    return [
      ...(Copy.safeParse(ch).error?.issues.map((issue) => `${label} ${issue.path.join(".")}: ${issue.message}`) ?? []),
      ...(invented.length ? [`${label}: numbers not in the facts: ${invented.join(", ")}`] : []),
      ...(banned.length ? [`${label}: banned words: ${banned.join(", ")}`] : []),
      ...(headlines.indexOf(headlines[i + 1]!) < i + 1 ? [`${label}: headline repeats the winner's or the other challenger's; make it distinct`] : []),
    ];
  });
}

export type AskModel = (system: string, user: string) => Promise<Challenger[]>;

const askCopyModel: AskModel = async (system, user) => {
  const { c1, c2 } = await chatJson({ model: MODELS.copy, system, user, name: "challengers", jsonSchema: replySchema, schema: Reply });
  return [c1, c2];
};

/** 2 challengers that pass challengerViolations; re-asks with the exact violations, then throws rather than ship bad copy. */
export async function generateChallengers(evidence: Evidence, product: Product, ask: AskModel = askCopyModel): Promise<Challenger[]> {
  const { winner } = evidence;
  if (!winner) throw new Error("no round-1 human winner (no variant with n >= 10) to challenge");
  const { system, user } = challengerPrompt(evidence, product);
  let feedback = "";
  for (let attempt = 1; ; attempt++) {
    const drafts = await ask(system, user + feedback);
    const problems = challengerViolations(drafts, product, winner);
    if (problems.length === 0) return drafts;
    if (attempt >= MAX_ATTEMPTS) throw new Error(`challenger copy still broke the rules after ${attempt} attempts: ${problems.join("; ")}`);
    feedback = [
      "\n\nYour previous attempt broke these rules. Fix every one and return both challengers again:",
      ...problems.map((p) => `- ${p}`),
      `Previous attempt: ${JSON.stringify(drafts)}`,
    ].join("\n");
  }
}

/**
 * Round 2: the winner unchanged as the control, then the challengers. Every arm carries the winner's lever and descends
 * from it. Challengers get no imageUrl here: their images are made later.
 */
export function buildRound2(winner: Variant, challengers: readonly Challenger[]): Variant[] {
  const incumbent: Variant = { ...winner, id: "r2-incumbent", round: 2, rationale: "Round-1 human winner, re-tested unchanged as the control", parentId: winner.id };
  return [
    incumbent,
    ...challengers.map((c, i): Variant => ({
      id: `r2-c${i + 1}`,
      round: 2,
      lever: winner.lever,
      headline: c.headline,
      body: c.body,
      cta: c.cta,
      rationale: c.rationale,
      parentId: winner.id,
    })),
  ];
}
