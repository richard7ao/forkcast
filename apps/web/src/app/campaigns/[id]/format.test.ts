import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { Campaign } from "@hack/contract";
import { byFitness, findAd, fmtRate, railSteps, sceneLabel } from "./format";

// Run from the repo root: node --import tsx "apps/web/src/app/campaigns/[id]/format.test.ts"
const demo = Campaign.parse(JSON.parse(readFileSync(join(process.cwd(), "fixtures/campaigns.json"), "utf8")).campaigns[0]);

test("rates use the house format, interval and n always shown", () => {
  assert.equal(fmtRate({ taps: 31, n: 47, rate: 0.66, lo: 0.544, hi: 0.763 }), "66% (54–76) · n 47");
  assert.equal(fmtRate({ taps: 0, n: 0, rate: null, lo: null, hi: null }), "No data yet · n 0");
});

test("scene labels are the short opening clause of the render prompt", () => {
  // Fixture-style prompts (subject, verb, "the unchanged pack") and real-run prompts (place, comma, pack).
  assert.equal(sceneLabel("A relaxed backyard BBQ scene pairs the unchanged pack, front label facing camera"), "Relaxed backyard BBQ");
  assert.equal(sceneLabel("1. A cosy movie-night nook places the exactly unchanged pack on a low oak table"), "Cosy movie-night nook");
  assert.equal(sceneLabel("At a woodland campsite, the unchanged pack stands front label to camera"), "At a woodland campsite");
  assert.equal(sceneLabel("On a dark wooden dining table beside a rain-streaked window, the unchanged EPIC pack"), "On a dark wooden dining table beside a…");
  assert.equal(sceneLabel("Flat lay of marshmallows on slate"), "Flat lay of marshmallows");
});

test("the grid follows the simulation's ranking, not the AI panel's", () => {
  // Survivors are picked by posterior simulated CTR; a culled ad can have a higher AI P(tap) than the winner.
  const culled = [...demo.generations[1]!.ads].filter((a) => a.status === "culled").sort(byFitness);
  const ctr = (a: (typeof culled)[number]) => (a.experiment!.clicks + 1) / (a.experiment!.impressions + 2);
  assert.ok(culled.every((a, i) => i === 0 || ctr(culled[i - 1]!) >= ctr(a)));
});

test("a carried-over survivor resolves to the copy in the generation it was opened from", () => {
  // Gen 1 re-screens the gen-0 survivors under the same id, so the id alone would show gen 0's numbers on a gen 1 tile.
  const id = "g0-health_halo-3";
  assert.equal(findAd(demo, id, 1), demo.generations[1]!.ads.find((a) => a.id === id));
  assert.equal(findAd(demo, id), demo.generations[0]!.ads.find((a) => a.id === id));
  assert.notEqual(findAd(demo, id, 1), findAd(demo, id));
});

test("the rail reads Gen 0, survivors, Gen 1, survivors, Winner for a finished run", () => {
  assert.deepEqual(railSteps(demo).map((s) => `${s.label}:${s.state}`), [
    "Gen 0 · 48 ads:done", "6 survive:done", "Gen 1 · 30 ads:done", "6 survive:done", "Winner:done",
  ]);
});

test("after Evolve, the rail shows the next generation running before it has any ads", () => {
  const evolving = { ...demo, stage: "writing" as const, winnerId: null };
  assert.deepEqual(railSteps(evolving).slice(-3).map((s) => `${s.label}:${s.state}`), ["Gen 2:run", "Survivors:todo", "Winner:todo"]);
});

test("the grid puts the winner first and culled ads last", () => {
  const sorted = [...demo.generations[1]!.ads].sort(byFitness);
  assert.equal(sorted[0]!.id, demo.winnerId);
  assert.equal(sorted.at(-1)!.status, "culled");
});
