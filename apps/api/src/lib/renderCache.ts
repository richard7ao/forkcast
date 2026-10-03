import { createHash } from "node:crypto";
import type { Campaign } from "@hack/contract";

/**
 * Render reuse, the demo path: a campaign whose upload is byte-identical to an earlier campaign's photo reuses
 * that run's scenes and renders instead of paying gpt-image-2 again. Copy, the panel and the simulation still
 * run live, and the progress label says renders were reused. A new product's photo matches nothing and
 * renders as normal; once its run finishes, its renders are reusable too, with no extra bookkeeping.
 */
export type Mutation = { scene: string; imageUrl: string };
export type RenderCache = {
  /** The run the gen-0 scenes and renders come from. */
  from: Campaign;
  scenes: string[];
  urls: string[];
  /** Parent scene -> rendered variations of it, from every run of this photo. */
  mutations: Map<string, Mutation[]>;
};

export const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Builds the cache from runs of the same photo; gen 0 comes from the oldest finished one. null if there is none, or if its gen 0 doesn't have exactly `sceneCount` renders. */
export function renderCacheFrom(runs: readonly Campaign[], sceneCount: number): RenderCache | null {
  const oldestFirst = [...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const from = oldestFirst.find((c) => (c.generations[0]?.ads.length ?? 0) > 0);
  if (!from) return null;
  // Gen 0 is lever-major (every lever runs scene i with render i), so unique renders in file order are scenes 0..n-1.
  const byUrl = new Map<string, string>();
  for (const ad of from.generations[0]!.ads) if (ad.imageUrl && !byUrl.has(ad.imageUrl)) byUrl.set(ad.imageUrl, ad.scene);
  if (byUrl.size !== sceneCount) return null;

  const mutations = new Map<string, Mutation[]>();
  for (const run of oldestFirst) {
    const ads = run.generations.flatMap((g) => g.ads);
    const byId = new Map(ads.map((ad) => [ad.id, ad])); // ids repeat across runs, so one map per run
    for (const ad of ads) {
      const parent = byId.get(ad.parentIds[0] ?? "");
      // A scene mutation has a new scene; copy mutations keep the parent's scene and render nothing.
      if (!parent || !ad.imageUrl || ad.scene === parent.scene) continue;
      const known = mutations.get(parent.scene) ?? [];
      if (!known.some((m) => m.imageUrl === ad.imageUrl)) mutations.set(parent.scene, [...known, { scene: ad.scene, imageUrl: ad.imageUrl }]);
    }
  }
  return { from, scenes: [...byUrl.values()], urls: [...byUrl.keys()], mutations };
}

/** The cache minus variations this campaign already shows, so evolving again never repeats one of its own images. */
export function withoutShown(cache: RenderCache, shown: ReadonlySet<string | undefined>): RenderCache {
  const mutations = new Map([...cache.mutations].map(([scene, list]) => [scene, list.filter((m) => !shown.has(m.imageUrl))] as const));
  return { ...cache, mutations };
}

/** Per survivor, the next unused cached variation of its scene, or null to render one live. */
export function pickMutations(parentScenes: readonly string[], cached: ReadonlyMap<string, readonly Mutation[]> | undefined): (Mutation | null)[] {
  const used = new Map<string, number>();
  return parentScenes.map((scene) => {
    const n = used.get(scene) ?? 0;
    const hit = cached?.get(scene)?.[n] ?? null;
    if (hit) used.set(scene, n + 1);
    return hit;
  });
}
