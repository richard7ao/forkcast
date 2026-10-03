import { z } from "zod";

export const Lever = z.enum(["social_proof", "scarcity", "health_halo", "indulgence", "provenance", "value"]);
export type Lever = z.infer<typeof Lever>;

/** Voter self-tag. "judge" is only reachable via /vote?seg=judge. The AI panel forecasts PANEL_SEGMENTS only. */
export const Segment = z.enum(["student", "young_pro", "parent", "fitness", "other", "judge"]);
export type Segment = z.infer<typeof Segment>;
export const PANEL_SEGMENTS = ["student", "young_pro", "parent", "fitness"] as const;

export const Product = z.object({
  brand: z.string(),
  name: z.string(),
  price: z.string(),           // display string, e.g. "£1.80"
  imageUrl: z.string(),        // served from apps/web/public, e.g. "/product.jpg"
  facts: z.array(z.string()),  // TRUE claims read off the pack; ad copy may only use these
});
export type Product = z.infer<typeof Product>;

export const Variant = z.object({
  id: z.string(),              // "r1-social_proof", "r2-incumbent", "r2-c1"
  round: z.number().int().min(1),
  lever: Lever,
  headline: z.string().max(60),
  body: z.string().max(160),
  cta: z.string().max(20),
  rationale: z.string(),       // how the copy expresses the lever; challengers cite the round-1 evidence they use
  parentId: z.string().nullable(), // round 2: the round-1 variant this one descends from; round 1: null
  imageUrl: z.string().optional(), // this ad's own AI image (from the one product photo); falls back to product.imageUrl
});
export type Variant = z.infer<typeof Variant>;

export const VariantsResponse = z.object({ round: z.number().int(), product: Product, variants: z.array(Variant) });

export const VoteRequest = z.object({
  voterId: z.string().min(8).max(64), // random UUID in localStorage; no PII
  segment: Segment,
  variantId: z.string(),
  tapped: z.boolean(),                // true = "Would tap", false = "Scroll past"
  dwellMs: z.number().int().min(0).max(600_000),
});
export type VoteRequest = z.infer<typeof VoteRequest>;
export const VoteResponse = z.object({ ok: z.boolean(), duplicate: z.boolean(), error: z.string().optional() });

/** Human tap rate with a 90% Wilson interval (z = 1.645). rate/lo/hi are null when n = 0. */
export const Rate = z.object({
  taps: z.number().int(),
  n: z.number().int(),
  rate: z.number().nullable(),
  lo: z.number().nullable(),
  hi: z.number().nullable(),
});
export type Rate = z.infer<typeof Rate>;

export const VariantResult = z.object({
  variantId: z.string(),
  round: z.number().int(),
  lever: Lever,
  human: Rate,
  ai: z.number().nullable(),          // sealed forecast P(tap), post-stratified to the room's panel-segment mix
  aiInsideCi: z.boolean().nullable(), // ai within [lo, hi]; null when human.n < 10 or ai is null
});
export type VariantResult = z.infer<typeof VariantResult>;

export const Cell = z.object({
  variantId: z.string(),
  segment: Segment,
  human: Rate,
  ai: z.number().nullable(),          // null for "other" and "judge" (not in the panel)
  enough: z.boolean(),                // human.n >= 10; UI shows "insufficient evidence" when false
});
export type Cell = z.infer<typeof Cell>;

export const Seal = z.object({
  round: z.number().int(),
  sealedAt: z.string(),               // ISO 8601 UTC
  sha256: z.string(),                 // hash of the canonical forecast JSON
  model: z.string(),
  personasPerSegment: z.number().int(),
});
export type Seal = z.infer<typeof Seal>;

export const Scorecard = z.object({
  round: z.number().int(),
  humanWinnerId: z.string().nullable(), // the top ad only when the paired test separates it from every rival (topGroup size 1)
  aiWinnerId: z.string().nullable(),
  aiPickedWinner: z.boolean().nullable(),
  mae: z.number().nullable(),         // mean |ai - human.rate| over variants with human.n >= 10 (0-1 scale)
  spearman: z.number().nullable(),    // rank agreement; null if < 3 variants have n >= 10 or the round has < 4 variants
  // docs/analysis-plan.md (pre-registered). Optional so older fixtures stay valid; absent when not computable.
  topGroup: z.array(z.string()).optional(),            // the top ad plus every ad a paired 90% test cannot separate from it
  aiPickInTopGroup: z.boolean().nullable().optional(), // the AI's sealed pick is in topGroup
  chanceRate: z.number().optional(),                   // topGroup size / ads in the round: a random pick's hit rate
  maeCi: z.tuple([z.number(), z.number()]).optional(), // 90% bootstrap interval of mae (2,000 voter resamples, seeded)
  maeNoiseFloor: z.number().optional(),                // expected mae of a perfect forecaster at the observed n
});
export type Scorecard = z.infer<typeof Scorecard>;

export const ResultsResponse = z.object({
  updatedAt: z.string(),
  activeRound: z.number().int(),
  voters: z.number().int(),
  votes: z.number().int(),
  segmentMix: z.array(z.object({ segment: Segment, voters: z.number().int() })),
  variants: z.array(VariantResult),
  cells: z.array(Cell),
  seals: z.array(Seal),
  scorecards: z.array(Scorecard),
});
export type ResultsResponse = z.infer<typeof ResultsResponse>;

export const ChallengerRequest = z.object({ adminToken: z.string() });
export const ChallengerResponse = z.object({
  ok: z.boolean(),
  round: z.number().int().optional(),
  variants: z.array(Variant).optional(),
  error: z.string().optional(),
});
