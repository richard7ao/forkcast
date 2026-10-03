import { PANEL_SEGMENTS, type Variant } from "@hack/contract";
import { SegmentProbabilities, type PanelAnswer } from "../data/files";

/** 32-bit FNV-1a: turns a persona id and round into a shuffle seed. */
function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** mulberry32: a tiny seeded PRNG returning floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The order one persona sees a round's ads in: Fisher-Yates seeded by persona and round, so position
 * bias is spread across the panel while every run shows each persona the same order. Never mutates the input.
 */
export function personaOrder<T>(personaId: string, round: number, variants: readonly T[]): T[] {
  const rand = mulberry32(hashString(`${personaId}:${round}`));
  const out = [...variants];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * P(tap) per variant and panel segment = taps / answers in that cell. Throws on any empty cell:
 * a gap must never be sealed as if it were a forecast.
 */
export function aggregate(answers: readonly PanelAnswer[], variants: readonly Pick<Variant, "id">[]): Record<string, SegmentProbabilities> {
  return Object.fromEntries(
    variants.map((variant) => {
      const cells = PANEL_SEGMENTS.map((segment) => {
        const cell = answers.filter((a) => a.variantId === variant.id && a.segment === segment);
        if (cell.length === 0) throw new Error(`no panel answers for ${variant.id} x ${segment}: refusing to forecast a gap`);
        return [segment, cell.filter((a) => a.decision === "tap").length / cell.length];
      });
      return [variant.id, SegmentProbabilities.parse(Object.fromEntries(cells))];
    }),
  );
}

/**
 * The sealed headline bet: each variant's equal-weight mean over the panel segments, and its argmax.
 * Means are rounded to 1e-6 so float summation order cannot split a tie; a tie goes to the earlier variant.
 */
export function pooledPick(
  perSegment: Record<string, SegmentProbabilities>,
  variants: readonly Pick<Variant, "id">[],
): { pooledEqual: Record<string, number>; pick: string } {
  const pooled = variants.map((variant) => {
    const p = perSegment[variant.id];
    if (!p) throw new Error(`no forecast for ${variant.id}`);
    const mean = PANEL_SEGMENTS.reduce((sum, segment) => sum + p[segment], 0) / PANEL_SEGMENTS.length;
    return [variant.id, Math.round(mean * 1e6) / 1e6] as const;
  });
  const best = pooled.reduce((a, b) => (b[1] > a[1] ? b : a));
  return { pooledEqual: Object.fromEntries(pooled), pick: best[0] };
}
