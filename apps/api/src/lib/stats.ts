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

/**
 * Paired (within-voter) difference in tap rate between two ads, from discordant pairs, McNemar-style:
 * b = voters who tapped the first ad only, c = the second only, n = voters who rated both.
 * d = (b - c) / n with SE = sqrt(b + c - (b - c)^2 / n) / n. Null when nobody rated both.
 */
export function pairedDiff(b: number, c: number, n: number, z = 1.645): { d: number; lo: number; hi: number } | null {
  if (n === 0) return null;
  const d = (b - c) / n;
  const se = Math.sqrt(Math.max(0, b + c - (b - c) ** 2 / n)) / n;
  return { d, lo: d - z * se, hi: d + z * se };
}

/** Seeded PRNG (mulberry32) in [0, 1): the bootstrap must print the same interval on every poll. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Linearly interpolated quantile of an ascending, non-empty list (numpy's default). */
export function quantile(sorted: readonly number[], p: number): number {
  const h = (sorted.length - 1) * p;
  const i = Math.floor(h);
  const below = sorted[i] ?? NaN;
  const above = sorted[Math.min(i + 1, sorted.length - 1)] ?? NaN;
  return below + (h - i) * (above - below);
}

/** Expected MAE of a perfect forecaster at these sample sizes: mean of sqrt(p(1-p)/n)·sqrt(2/π). Null with nothing to score. */
export function noiseFloor(rates: readonly { p: number; n: number }[]): number | null {
  return rates.length === 0 ? null : mean(rates.map(({ p, n }) => Math.sqrt((p * (1 - p)) / n) * Math.sqrt(2 / Math.PI)));
}

/** Panel forecast weighted by the room's voter count per panel segment; equal weights before anyone votes. */
export function postStratify(aiBySegment: SegmentProbabilities, mix: Partial<Record<PanelSegment, number>>): number {
  const total = sum(PANEL_SEGMENTS.map((seg) => mix[seg] ?? 0));
  if (total === 0) return mean(PANEL_SEGMENTS.map((seg) => aiBySegment[seg]));
  return sum(PANEL_SEGMENTS.map((seg) => aiBySegment[seg] * (mix[seg] ?? 0))) / total;
}
