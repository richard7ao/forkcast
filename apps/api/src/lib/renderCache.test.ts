import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Campaign } from "@hack/contract";
import { pickMutations, renderCacheFrom, replayable, withoutShown, type Mutation } from "./renderCache";

// The real demo run (demo-epic): gen 0 is 8 scenes x 6 levers, every ad with its own image; gen 1 has 6 scene
// mutations (three of them of scene 3) and 18 copy mutations, which keep their parent's scene.
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

test("a run that has not finished gen 0 is never a source: a new product's photo renders live", () => {
  assert.equal(renderCacheFrom([]), null);
  assert.equal(renderCacheFrom([running("2026-10-03T13:00:00Z")]), null);
  // ...and a finished run of the same photo is found even when a newer run is still going
  assert.equal(renderCacheFrom([running("2026-10-04T00:00:00Z"), demo])?.from.id, demo.id);
});

test("the oldest finished run is the source whatever order runs are listed in, so every re-upload shows the original's images", () => {
  assert.equal(renderCacheFrom([liveRun, demo])?.from.id, demo.id);
});

test("scene mutations are cached under their parent's scene; copy mutations keep the parent's scene and add nothing", () => {
  const { mutations } = renderCacheFrom([demo])!;
  const cached = [...mutations.values()].flat().map((m) => m.imageUrl);
  assert.equal(cached.length, 6);
  assert.equal(new Set(cached).size, 6);
  assert.ok(cached.every((url) => url.endsWith("-s1.png")));
  assert.equal(mutations.get(sceneOf(3))?.length, 3);
  // Every ad has its own image now, so it is the copy mutations' unchanged scene that keeps all 18 out.
  const parentScene = new Map(demo.generations[0]!.ads.map((ad) => [ad.id, ad.scene]));
  const copies = demo.generations[1]!.ads.filter((ad) => /-c\d$/.test(ad.id));
  assert.equal(copies.length, 18);
  assert.ok(copies.every((ad) => ad.scene === parentScene.get(ad.parentIds[0]!)));
  assert.ok(copies.every((ad) => !cached.includes(ad.imageUrl!)));
});

test("across runs, a reused render is cached once, and each run's variations stay under its own parents' scenes", () => {
  // Counted twice, one render could go to two survivors of the same scene.
  assert.equal([...renderCacheFrom([demo, reuseRun])!.mutations.values()].flat().length, 6);
  // Ad ids repeat across runs: a parent looked up in the wrong run would file the variation under the wrong scene.
  const { mutations } = renderCacheFrom([demo, liveRun])!;
  assert.equal(mutations.get(sceneOf(3))?.length, 3);
  assert.equal(mutations.get(`${sceneOf(3)} Again.`)?.length, 3);
});

test("the demo photo replays the earlier run: gen 0 for a new campaign, then each next generation while its history matches", () => {
  assert.equal(replayable({ generations: [] }, demo, 0), demo.generations[0]);
  assert.equal(replayable({ generations: [demo.generations[0]!] }, demo, 1), demo.generations[1]);
});

test("a campaign whose history differs, or that is past the earlier run's last generation, runs live", () => {
  const drifted = { ...demo.generations[0]!, sealedSha256: "a different seal" };
  assert.equal(replayable({ generations: [drifted] }, demo, 1), null);
  assert.equal(replayable(demo, demo, 2), null);
});

test("evolving a campaign again never reuses a variation it already shows: those survivors render live", () => {
  const cache = renderCacheFrom([demo])!;
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
