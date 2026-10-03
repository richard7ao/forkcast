import assert from "node:assert/strict";
import { test } from "node:test";
import { simulateDelivery } from "./simulate";

const arms = [
  { id: "strong", trueRate: 0.04 },
  { id: "middle", trueRate: 0.02 },
  { id: "weak", trueRate: 0.005 },
];

test("winners get most of the budget: the bandit is what turns a panel guess into a delivery story", () => {
  const { byAd } = simulateDelivery(arms, { seed: 7 });
  assert.ok(byAd.strong!.impressions > 5_000, `strong got ${byAd.strong!.impressions}`);
  assert.ok(byAd.strong!.impressions > byAd.middle!.impressions);
});

test("low-rate arms are starved: losers stop costing money once the evidence is in", () => {
  const { byAd } = simulateDelivery(arms, { seed: 7 });
  assert.ok(byAd.weak!.impressions < 1_000, `weak got ${byAd.weak!.impressions}`);
});

test("the same seed gives the same result: a sealed generation must replay identically", () => {
  assert.deepEqual(simulateDelivery(arms, { seed: 42 }), simulateDelivery(arms, { seed: 42 }));
  assert.notDeepEqual(simulateDelivery(arms, { seed: 42 }), simulateDelivery(arms, { seed: 43 }));
});

test("total impressions are conserved: the timeline is cumulative and ends at the budget", () => {
  const { byAd, timeline } = simulateDelivery(arms, { impressions: 9_999, steps: 20, seed: 1 });
  const total = (m: Record<string, number>) => Object.values(m).reduce((s, x) => s + x, 0);
  assert.equal(Object.values(byAd).reduce((s, e) => s + e.impressions, 0), 9_999);
  assert.equal(timeline.length, 20);
  assert.equal(total(timeline.at(-1)!.impressionsByAd), 9_999);
  for (let i = 1; i < timeline.length; i++) assert.ok(total(timeline[i]!.impressionsByAd) > total(timeline[i - 1]!.impressionsByAd));
  for (const e of Object.values(byAd)) assert.ok(e.lo <= e.ctr && e.ctr <= e.hi && e.clicks <= e.impressions);
});
