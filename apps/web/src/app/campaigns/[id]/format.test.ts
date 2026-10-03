import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { Campaign, type Ad } from "@hack/contract";
import { audienceGrid, byFitness, cullOrder, findAd, fmtRate, gensSurvived, leverSceneGrid, median, railSteps, sceneLabel } from "./format";

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
  // The backend keeps the previous winnerId while it evolves; the rail must not show that winner as done.
  const evolving = { ...demo, stage: "writing" as const };
  assert.deepEqual(railSteps(evolving).slice(-3).map((s) => `${s.label}:${s.state}`), ["Gen 2:run", "Survivors:todo", "Winner:todo"]);
});

test("the grid puts the winner first and culled ads last", () => {
  const sorted = [...demo.generations[1]!.ads].sort(byFitness);
  assert.equal(sorted[0]!.id, demo.winnerId);
  assert.equal(sorted.at(-1)!.status, "culled");
});

test("the rollout crosses out the weakest ad first and never touches a survivor", () => {
  const order = cullOrder(demo.generations[0]!.ads);
  const post = (a: (typeof order)[number]) => (a.experiment!.clicks + 1) / (a.experiment!.impressions + 2);
  assert.equal(order.length, demo.generations[0]!.ads.length - demo.generations[0]!.survivorIds.length);
  assert.ok(order.every((a) => a.status === "culled"));
  assert.ok(order.every((a, i) => i === 0 || post(order[i - 1]!) <= post(a)));
});

test("the lever × scene heat map has one cell per lever and scene, and outlines the simulation's top pick", () => {
  const ads = demo.generations[0]!.ads;
  const { scenes, rows, best } = leverSceneGrid(ads);
  assert.equal(rows.length * scenes.length, ads.length); // gen 0 is the full 6 × 8 grid
  assert.ok(rows.every((r) => r.cells.every((a) => a?.lever === r.lever)));
  assert.equal(best?.id, [...ads].sort(byFitness)[0]!.id);
  assert.ok(demo.generations[0]!.survivorIds.includes(best!.id));
});

test("the audience heat map averages each lever's ads per segment and skips ads without a score", () => {
  const [a, b] = demo.generations[0]!.ads.filter((x) => x.lever === "value");
  const ads: Ad[] = [
    { ...a!, fitness: { ...a!.fitness, aiBySegment: { student: 0.2, parent: 0.5 } } },
    { ...b!, fitness: { ...b!.fitness, aiBySegment: { student: 0.6 } } },
  ];
  const { levers, rows } = audienceGrid(ads);
  assert.deepEqual(levers, ["value"]);
  assert.deepEqual(rows.map((r) => [r.seg, r.cells[0]]), [["student", 0.4], ["young_pro", null], ["parent", 0.5], ["fitness", null]]);
});

test("the winner page compares against the generation median and counts the culls an ad came through", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
  // A gen-0 survivor carried into gen 1 and kept again came through two culls; a gen-1 child, one.
  const id = "g0-health_halo-3"; // a gen-0 survivor, re-screened and culled in gen 1
  assert.equal(gensSurvived(demo, id), 1);
  const keptAgain = { ...demo, generations: demo.generations.map((g) => ({ ...g, ads: g.ads.map((a) => (a.id === id ? { ...a, status: "survivor" as const } : a)) })) };
  assert.equal(gensSurvived(keptAgain, id), 2);
  assert.equal(gensSurvived(demo, demo.winnerId!), 1);
});
