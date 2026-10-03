import assert from "node:assert/strict";
import { test } from "node:test";
import { PANEL_SEGMENTS, type Ad, type Lever } from "@hack/contract";
import type { Persona } from "../data/files";
import { copyViolations, enrichFromCatalog, leverOf, runExperiment, screeningPlan, sealGeneration, select, tally } from "./evolve";

const product = { brand: "EPIC Snax Co.", name: "Giant Toastin' Marshmallows", price: "", imageUrl: "/p.png", facts: ["300g bag", "0g fat"] };

function ad(id: string, lever: Lever, opts: { clicks?: number; impressions?: number; rate?: number } = {}): Ad {
  const rate = opts.rate ?? 0.3;
  return {
    id, round: 1, lever, headline: "Toast it", body: "Giant mallows.", cta: "Shop", rationale: "", parentId: null,
    gen: 0, parentIds: [], scene: "campfire", status: "screening",
    fitness: { ai: null, human: null, aiBySegment: Object.fromEntries(PANEL_SEGMENTS.map((s) => [s, rate])) },
    experiment: opts.impressions === undefined ? null : { impressions: opts.impressions, clicks: opts.clicks ?? 0, ctr: 0, lo: 0, hi: 1 },
  };
}

test("a lever never takes more than 2 of the 4 survivor slots: breeding needs diversity, not 4 copies of one idea", () => {
  const ads = [
    ...[0, 1, 2, 3].map((i) => ad(`g0-indulgence-${i}`, "indulgence", { clicks: 60 - i, impressions: 1000 })),
    ...(["value", "scarcity", "provenance", "social_proof"] as const).map((lever, i) => ad(`g0-${lever}-0`, lever, { clicks: 30 - i, impressions: 1000 })),
  ];
  const ids = select(ads);
  assert.equal(ids.length, 4);
  assert.deepEqual(ids.slice(0, 2), ["g0-indulgence-0", "g0-indulgence-1"]);
  assert.equal(ids.filter((id) => id.includes("indulgence")).length, 2);
});

test("survivors rank by posterior mean CTR: more clicks per impression wins, not more impressions", () => {
  const ids = select([ad("a", "value", { clicks: 10, impressions: 2000 }), ad("b", "value", { clicks: 30, impressions: 1000 })], 1);
  assert.deepEqual(ids, ["b"]);
});

const personas: Persona[] = PANEL_SEGMENTS.flatMap((segment) =>
  Array.from({ length: 25 }, (_, i) => ({ id: `${segment}-${i + 1}`, segment, name: `P${i}`, bio: "You scroll." })),
);

test("every ad reaches every panel segment and no persona sees an ad twice: an empty cell would make the simulation's input a guess", () => {
  for (const n of [20, 5]) {
    const adIds = Array.from({ length: n }, (_, i) => `ad-${i}`);
    const plan = screeningPlan(adIds, personas, 9);
    assert.equal(plan.length, 40);
    for (const { adIds: seen } of plan) assert.equal(new Set(seen).size, seen.length);
    for (const segment of PANEL_SEGMENTS) {
      const reached = new Set(plan.filter((p) => p.persona.segment === segment).flatMap((p) => p.adIds));
      assert.equal(reached.size, n, `${segment} reached ${reached.size}/${n} ads`);
    }
  }
  assert.deepEqual(screeningPlan(["a", "b", "c"], personas, 1), screeningPlan(["a", "b", "c"], personas, 1));
});

test("tally pools taps into a Wilson rate and keeps each segment's P(tap) for the simulation", () => {
  const f = tally(
    [
      { adId: "a", segment: "student", tap: true },
      { adId: "a", segment: "student", tap: false },
      { adId: "a", segment: "parent", tap: true },
      { adId: "a", segment: "fitness", tap: false },
      { adId: "a", segment: "young_pro", tap: false },
    ],
    ["a"],
  ).a!;
  assert.equal(f.ai?.taps, 2);
  assert.equal(f.ai?.n, 5);
  assert.deepEqual(f.aiBySegment, { student: 0.5, young_pro: 0, parent: 1, fitness: 0 });
});

test("copy that invents a number or a claim is rejected before any persona or person sees it", () => {
  const ok = { headline: "300g of giant mallows", body: "0g fat, all toast.", cta: "Shop", rationale: "" };
  assert.deepEqual(copyViolations([ok], 1, product), []);
  const bad = copyViolations([{ ...ok, headline: "Loved by 10,000 campers" }], 1, product);
  assert.ok(bad.some((p) => p.includes("10,000")) && bad.some((p) => p.includes("Loved by")), bad.join("; "));
  assert.ok(copyViolations([ok, ok], 1, product).some((p) => p.includes("exactly 1")));
});

test("gen 0 only picks survivors; a later generation crowns its top survivor the winner", () => {
  const ads = (["indulgence", "value", "scarcity", "provenance", "social_proof", "health_halo", "value"] as const).map((lever, i) => ad(`x-${i}`, lever, { rate: 0.2 + i * 0.05 }));
  const g0 = runExperiment(0, ads, 5);
  assert.equal(g0.survivorIds.length, 4);
  assert.ok(g0.ads.every((a) => a.status !== "winner" && a.experiment !== null));
  assert.equal(g0.ads.filter((a) => a.status === "culled").length, 3);
  const g1 = runExperiment(1, ads, 5);
  assert.equal(g1.ads.find((a) => a.status === "winner")?.id, g1.survivorIds[0]);
});

test("the seal changes when any fitness number changes: a sealed generation cannot be quietly edited", () => {
  const { ads } = runExperiment(0, [ad("a", "value"), ad("b", "indulgence")], 3);
  const edited = ads.map((a, i) => (i === 0 ? { ...a, experiment: { ...a.experiment!, clicks: a.experiment!.clicks + 1 } } : a));
  assert.equal(sealGeneration(0, ads), sealGeneration(0, ads));
  assert.notEqual(sealGeneration(0, ads), sealGeneration(0, edited));
});

test("catalog enrichment: a front photo of a catalog pack gains its checked back-label facts; any other product stays exactly as read", () => {
  const read = { brand: "EP!C", name: "GIANT TOASTIN’ MARSHMALLOWS", price: "", imageUrl: "/up.jpg", facts: ["PERFECT FOR THE BBQ", "0G FAT"] };
  const merged = enrichFromCatalog(read, product);
  assert.equal(merged.brand, "EPIC Snax Co.");
  assert.equal(merged.imageUrl, "/up.jpg");
  assert.deepEqual(merged.facts, ["300g bag", "0g fat", "PERFECT FOR THE BBQ"]);
  const other = { ...read, name: "Ginger Beer" };
  assert.equal(enrichFromCatalog(other, product), other);
  assert.equal(enrichFromCatalog(read, null), read);
});

test("gen 0's 20 ads deal the levers round-robin, so every lever is tested on at least 3 distinct scenes", () => {
  const counts = new Map<string, number>();
  for (let i = 0; i < 20; i++) counts.set(leverOf(i), (counts.get(leverOf(i)) ?? 0) + 1);
  assert.equal(counts.size, 6);
  assert.ok([...counts.values()].every((n) => n === 3 || n === 4));
});
