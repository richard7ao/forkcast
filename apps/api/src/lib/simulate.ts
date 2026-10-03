import type { Experiment, Generation } from "@hack/contract";
import { seededRandom, wilson } from "./stats";

/** Maps panel tap intent (0-1) onto a Meta-like CTR range (0-5%). Simulated, not real. */
export const SIM_CTR_SCALE = 0.05;

export type Arm = { id: string; trueRate: number };
export type Delivery = { byAd: Record<string, Experiment>; timeline: Generation["timeline"] };

/** Standard normal (Box-Muller). 1 - rand() keeps log() away from 0. */
function normal(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

/** Gamma(shape >= 1, 1), Marsaglia-Tsang. Shapes here are always 1 + a count. */
function gamma(shape: number, rand: () => number): number {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(rand);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = 1 - rand();
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}

const betaSample = (a: number, b: number, rand: () => number) => {
  const x = gamma(a, rand);
  return x / (x + gamma(b, rand));
};

/**
 * Meta-style delivery as a Thompson-sampling bandit: each impression goes to the ad whose
 * Beta(1 + clicks, 1 + misses) draw is highest, then clicks with that ad's trueRate.
 * Budget flows to winners and starves losers, as an ad auction's learning phase does.
 */
export function simulateDelivery(arms: readonly Arm[], opts: { impressions?: number; steps?: number; seed: number }): Delivery {
  const { impressions = 10_000, steps = 20, seed } = opts;
  const rand = seededRandom(seed);
  const shown = arms.map(() => 0);
  const clicks = arms.map(() => 0);
  const timeline: Delivery["timeline"] = [];
  let served = 0;
  for (let step = 1; step <= steps; step++) {
    for (const end = Math.round((step * impressions) / steps); served < end; served++) {
      let best = 0;
      let bestDraw = -1;
      arms.forEach((_, i) => {
        const draw = betaSample(1 + clicks[i]!, 1 + shown[i]! - clicks[i]!, rand);
        if (draw > bestDraw) [best, bestDraw] = [i, draw];
      });
      shown[best]!++;
      if (rand() < arms[best]!.trueRate) clicks[best]!++;
    }
    timeline.push({ step, impressionsByAd: Object.fromEntries(arms.map((a, i) => [a.id, shown[i]!])) });
  }
  const byAd = Object.fromEntries(
    arms.map((a, i) => {
      const r = wilson(clicks[i]!, shown[i]!);
      return [a.id, { impressions: shown[i]!, clicks: clicks[i]!, ctr: r.rate ?? 0, lo: r.lo ?? 0, hi: r.hi ?? 1 }];
    }),
  );
  return { byAd, timeline };
}
