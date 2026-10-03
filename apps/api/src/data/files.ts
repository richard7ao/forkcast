import { join } from "node:path";
import { z } from "zod";
import { PANEL_SEGMENTS, Variant, VoteRequest } from "@hack/contract";

/**
 * On-disk formats under DATA_DIR. Internal to apps/api (not the HTTP contract),
 * but shared by the store, the AI scripts and the challenger, so defined once.
 *
 *   product.json             Product (from @hack/contract), written by the frontend lane
 *   variants/round-N.json    VariantsFile
 *   forecasts/round-N.json   ForecastFile (sealed before round N's first vote)
 *   personas.json            PersonasFile (created once, reused every round)
 *   state.json               StateFile
 *   votes.jsonl              one VoteLine per line, append-only
 */
export function dataDir(): string {
  return process.env.DATA_DIR ?? join(process.cwd(), "../../data");
}

export const PanelSegment = z.enum(PANEL_SEGMENTS);
export type PanelSegment = z.infer<typeof PanelSegment>;

export const VariantsFile = z.object({ round: z.number().int().min(1), variants: z.array(Variant) });
export type VariantsFile = z.infer<typeof VariantsFile>;

export const Persona = z.object({ id: z.string(), segment: PanelSegment, name: z.string(), bio: z.string() });
export type Persona = z.infer<typeof Persona>;
export const PersonasFile = z.object({ personas: z.array(Persona) });
export type PersonasFile = z.infer<typeof PersonasFile>;

export const PanelAnswer = z.object({
  personaId: z.string(),
  segment: PanelSegment,
  variantId: z.string(),
  decision: z.enum(["tap", "scroll"]),
  reason: z.string(),
});
export type PanelAnswer = z.infer<typeof PanelAnswer>;

const Probability = z.number().min(0).max(1);
/** Every panel segment is required, so a sealed forecast with a gap fails to parse. */
export const SegmentProbabilities = z.object({ student: Probability, young_pro: Probability, parent: Probability, fitness: Probability });
export type SegmentProbabilities = z.infer<typeof SegmentProbabilities>;

export const ForecastFile = z.object({
  round: z.number().int().min(1),
  model: z.string(),
  personasPerSegment: z.number().int().min(1),
  /** P(tap) by variantId, then by panel segment. */
  perSegment: z.record(z.string(), SegmentProbabilities),
  answers: z.array(PanelAnswer),
  /** Equal-segment-weight P(tap) per variant, and its argmax: the AI's headline bet, fixed at seal time. */
  pooledEqual: z.record(z.string(), Probability).optional(),
  pick: z.string().optional(),
  sealedAt: z.string(),
  /** sha256 of the canonical JSON (sorted keys) of every other field. */
  sha256: z.string(),
});
export type ForecastFile = z.infer<typeof ForecastFile>;

/** generated.json: AI ad visuals per round (render-visual.ts). The store serves heroByRound[round] as product.imageUrl. */
export const GeneratedFile = z.object({ heroByRound: z.record(z.string(), z.string()) });
export type GeneratedFile = z.infer<typeof GeneratedFile>;

export const StateFile = z.object({
  activeRound: z.number().int().min(1),
  /** Round -> ISO opening time; votes cast earlier (phone tests) stay in the file but are excluded. */
  opensAt: z.record(z.string(), z.string()).optional(),
});
export type StateFile = z.infer<typeof StateFile>;

export const VoteLine = VoteRequest.extend({ at: z.string() });
export type VoteLine = z.infer<typeof VoteLine>;
