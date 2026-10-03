import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Campaign } from "@hack/contract";
import { pickMutations, renderCacheFrom, withoutShown, type Mutation } from "./renderCache";

// The real demo run: gen 0 has 8 rendered scenes; gen 1 has 6 scene mutations (three of them of scene 3).
const demo = Campaign.parse(JSON.parse(readFileSync(new URL("../../../../fixtures/campaigns.json", import.meta.url), "utf8")).campaigns[0]);
const running = (createdAt: string): Campaign => ({ ...demo, id: "running", createdAt, stage: "writing", generations: [], winnerId: null });
const sceneOf = (i: number) => demo.generations[0]!.ads.find((ad) => ad.id === `g0-social_proof-${i}`)!.scene;
// Two later runs of the same photo, with the demo's ad ids: one reused all its renders (the demo path), one wrote and rendered its own.
const reuseRun: Campaign = { ...demo, id: "reuse", createdAt: "2026-10-04T00:00:00Z" };
const liveRun: Campaign = {
  ...reuseRun,
  id: "live",
  generations: demo.generations.map((g) => ({
    ...g,
    ads: g.ads.map((ad) => ({ ...ad, scene: `${ad.scene} Again.`, imageUrl: ad.imageUrl?.replace("/d87ed849/", "/live/") })),
  })),
};

test("the same photo reuses the earlier run's 8 scenes with their renders, in scene order, so copy is written for the right image", () => {
  const cache = renderCacheFrom([demo], 8)!;
  assert.deepEqual(cache.urls, [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `/generated/campaigns/d87ed849/scene-${i}.png`));
  assert.deepEqual(cache.scenes, [0, 1, 2, 3, 4, 5, 6, 7].map(sceneOf));
  // ...and a run with another scene count is not reused at all, rather than pair copy with the wrong render
  assert.equal(renderCacheFrom([demo], 9), null);
});

test("a run that has not finished gen 0 is never a source: a new product's photo renders live", () => {
  assert.equal(renderCacheFrom([], 8), null);
  assert.equal(renderCacheFrom([running("2026-10-03T13:00:00Z")], 8), null);
  // ...and a finished run of the same photo is found even when a newer run is still going
  assert.equal(renderCacheFrom([running("2026-10-04T00:00:00Z"), demo], 8)?.from.id, demo.id);
});

test("the oldest finished run is the source whatever order runs are listed in, so every re-upload shows the original's images", () => {
  assert.equal(renderCacheFrom([liveRun, demo], 8)?.from.id, demo.id);
});

test("scene mutations are cached under their parent's scene; copy mutations keep the parent's render and add nothing", () => {
  const { mutations, urls } = renderCacheFrom([demo], 8)!;
  const all = [...mutations.values()].flat();
  assert.equal(all.length, 6);
  assert.equal(mutations.get(sceneOf(3))?.length, 3);
  assert.ok(all.every((m) => !urls.includes(m.imageUrl) && m.imageUrl.endsWith("-s1.png")));
});

test("across runs, a reused render is cached once, and each run's variations stay under its own parents' scenes", () => {
  // Counted twice, one render could go to two survivors of the same scene.
  assert.equal([...renderCacheFrom([demo, reuseRun], 8)!.mutations.values()].flat().length, 6);
  // Ad ids repeat across runs: a parent looked up in the wrong run would file the variation under the wrong scene.
  const { mutations } = renderCacheFrom([demo, liveRun], 8)!;
  assert.equal(mutations.get(sceneOf(3))?.length, 3);
  assert.equal(mutations.get(`${sceneOf(3)} Again.`)?.length, 3);
});

test("evolving a campaign again never reuses a variation it already shows: those survivors render live", () => {
  const cache = renderCacheFrom([demo], 8)!;
  const shown = new Set(demo.generations.flatMap((g) => g.ads.map((ad) => ad.imageUrl)));
  const fresh = withoutShown(cache, shown);
  assert.equal([...fresh.mutations.values()].flat().length, 0); // all 6 cached variations are demo's own gen-1 images
  assert.deepEqual(pickMutations([sceneOf(3)], fresh.mutations), [null]);
  // ...while a different campaign of the same photo, which has not shown them, still reuses them
  assert.equal([...withoutShown(cache, new Set()).mutations.values()].flat().length, 6);
});

test("each survivor takes the next unused variation of its scene, and renders live once they run out", () => {
  const m = (name: string): Mutation => ({ scene: name, imageUrl: `/${name}.png` });
  const cached = new Map([["A", [m("a1")]], ["B", [m("b1"), m("b2")]]]);
  assert.deepEqual(pickMutations(["A", "A", "B", "C"], cached), [m("a1"), null, m("b1"), null]);
  assert.deepEqual(pickMutations(["A"], undefined), [null]);
});
