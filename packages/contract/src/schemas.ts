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

// ---- v2: the evolution engine (campaigns). Additive; nothing above changed. ----

/** One ad's SIMULATED Meta-style delivery (Thompson-sampling bandit). Not real CTR. lo/hi = 90% Wilson on ctr. */
export const Experiment = z.object({
  impressions: z.number().int(),
  clicks: z.number().int(),
  ctr: z.number(),
  lo: z.number(),
  hi: z.number(),
});
export type Experiment = z.infer<typeof Experiment>;

/** A genome { lever, scene, headline, body, cta } plus its fitness. `round` = gen + 1 (Variant needs >= 1). */
export const Ad = Variant.extend({
  gen: z.number().int().min(0),
  parentIds: z.array(z.string()),         // gen 0: []; children: [the survivor they mutate]
  scene: z.string(),                      // the scene the image was rendered from
  // ai = text-screen panel taps, pooled; aiBySegment = panel segment -> P(tap), which drives the simulation
  fitness: z.object({ ai: Rate.nullable(), human: Rate.nullable(), aiBySegment: z.record(z.string(), z.number()).optional() }),
  experiment: Experiment.nullable(),      // null until the generation's simulation has run
  status: z.enum(["screening", "survivor", "culled", "winner"]),
});
export type Ad = z.infer<typeof Ad>;

export const Generation = z.object({
  gen: z.number().int().min(0),
  ads: z.array(Ad),
  survivorIds: z.array(z.string()),
  sealedSha256: z.string().nullable(),    // sha256 of this generation's canonical fitness table
  tokens: z.number().int(),
  seconds: z.number(),
  // 20 cumulative snapshots of the simulated budget flowing to winners
  timeline: z.array(z.object({ step: z.number().int(), impressionsByAd: z.record(z.string(), z.number().int()) })),
});
export type Generation = z.infer<typeof Generation>;

export const CampaignStage = z.enum(["reading", "writing", "rendering", "screening", "simulating", "selecting", "done", "error"]);
export type CampaignStage = z.infer<typeof CampaignStage>;

export const Campaign = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),                  // ISO 8601 UTC
  sourceImageUrl: z.string(),             // the uploaded image, served from apps/web/public
  product: Product,                       // facts read off the pack; empty until "reading" finishes
  stage: CampaignStage,
  progress: z.object({ label: z.string(), done: z.number().int(), total: z.number().int() }), // e.g. "Rendering scenes", 5, 8
  generations: z.array(Generation),
  winnerId: z.string().nullable(),
  error: z.string().optional(),
});
export type Campaign = z.infer<typeof Campaign>;

/** ~6 MB of image: base64 is 4/3 of the bytes. */
export const CreateCampaignRequest = z.object({
  imageDataUrl: z.string().max(8_400_000).regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/, "must be a jpeg or png data URL"),
  name: z.string().max(80).optional(),
});
export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequest>;
export const CreateCampaignResponse = z.object({ ok: z.boolean(), campaignId: z.string().optional(), error: z.string().optional() });
export const CampaignResponse = z.object({ campaign: Campaign });
export const EvolveResponse = z.object({ ok: z.boolean(), campaign: Campaign.optional(), error: z.string().optional() });
