import { PANEL_SEGMENTS, type Rate } from "@hack/contract";
import type { PanelSegment, SegmentProbabilities } from "../data/files";

/** Tap rate with a Wilson score interval (z = 1.645 is 90%). rate/lo/hi are null when n = 0. */
export function wilson(taps: number, n: number, z = 1.645): Rate {
  if (n === 0) return { taps, n, rate: null, lo: null, hi: null };
  const p = taps / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  // Clamp: float error can push a 0% or 100% bound a hair outside [0, 1].
  return { taps, n, rate: p, lo: Math.max(0, center - margin), hi: Math.min(1, center + margin) };
}

const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);
const mean = (xs: readonly number[]) => sum(xs) / xs.length;

/** 1-based ranks; tied values share the average of the positions they occupy. */
function ranks(xs: readonly number[]): number[] {
  const sorted = [...xs].sort((a, b) => a - b);
  return xs.map((x) => (sorted.indexOf(x) + sorted.lastIndexOf(x)) / 2 + 1);
}

/** Spearman's rho (Pearson on average ranks). Null below 3 points or when either side has no variance. */
export function spearman(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length !== ys.length) throw new Error(`spearman: ${xs.length} xs vs ${ys.length} ys`);
  if (xs.length < 3) return null;
  const rx = ranks(xs);
  const ry = ranks(ys);
  const mx = mean(rx);
  const my = mean(ry);
  const dx = rx.map((r) => r - mx);
  const dy = ry.map((r) => r - my);
  const sxx = sum(dx.map((d) => d * d));
  const syy = sum(dy.map((d) => d * d));
  if (sxx === 0 || syy === 0) return null;
  return sum(dx.map((d, i) => d * (dy[i] ?? 0))) / Math.sqrt(sxx * syy);
}

/** Mean absolute error over [predicted, observed] pairs; null when there are none. */
export function mae(pairs: readonly (readonly [number, number])[]): number | null {
  return pairs.length === 0 ? null : mean(pairs.map(([a, b]) => Math.abs(a - b)));
}

/** Panel forecast weighted by the room's voter count per panel segment; equal weights before anyone votes. */
export function postStratify(aiBySegment: SegmentProbabilities, mix: Partial<Record<PanelSegment, number>>): number {
  const total = sum(PANEL_SEGMENTS.map((seg) => mix[seg] ?? 0));
  if (total === 0) return mean(PANEL_SEGMENTS.map((seg) => aiBySegment[seg]));
  return sum(PANEL_SEGMENTS.map((seg) => aiBySegment[seg] * (mix[seg] ?? 0))) / total;
}
