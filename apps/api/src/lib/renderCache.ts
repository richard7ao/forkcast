import { createHash } from "node:crypto";
import type { Campaign, Generation } from "@hack/contract";

/**
 * The demo path, for a photo seen before: a campaign whose upload is byte-identical to an earlier campaign's photo
 * replays that run with no model calls, generation by generation, while its history matches it seal for seal. Past
 * that it evolves live, but reuses scene-mutation renders of the photo it has not shown yet instead of paying
 * gpt-image-2 again. The progress labels say so either way. A new product's photo matches nothing and runs as
 * normal; once its run finishes, it is reusable too, with no extra bookkeeping.
 */
export type Mutation = { scene: string; imageUrl: string };
export type RenderCache = {
  /** The oldest run of this photo with a finished gen 0: the one a re-upload replays. */
  from: Campaign;
  /** Parent scene -> rendered variations of it, from every run of this photo. */
  mutations: Map<string, Mutation[]>;
};

export const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Builds the cache from runs of the same photo; `from` is the oldest one with a finished gen 0. null if there is none. */
export function renderCacheFrom(runs: readonly Campaign[]): RenderCache | null {
  const oldestFirst = [...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const from = oldestFirst.find((c) => (c.generations[0]?.ads.length ?? 0) > 0);
  if (!from) return null;

  const mutations = new Map<string, Mutation[]>();
  for (const run of oldestFirst) {
    const ads = run.generations.flatMap((g) => g.ads);
    const byId = new Map(ads.map((ad) => [ad.id, ad])); // ids repeat across runs, so one map per run
    for (const ad of ads) {
      const parent = byId.get(ad.parentIds[0] ?? "");
      // A scene mutation has a new scene; a copy mutation keeps its parent's scene, whatever its image.
      if (!parent || !ad.imageUrl || ad.scene === parent.scene) continue;
      const known = mutations.get(parent.scene) ?? [];
      if (!known.some((m) => m.imageUrl === ad.imageUrl)) mutations.set(parent.scene, [...known, { scene: ad.scene, imageUrl: ad.imageUrl }]);
    }
  }
  return { from, mutations };
}

/**
 * Full replay, the demo path: the source run's generation `gen`, provided this campaign has so far replayed that
 * run exactly (every generation it has carries the same seal). null means run it live.
 */
export function replayable(campaign: Pick<Campaign, "generations">, source: Campaign, gen: number): Generation | null {
  const sameSoFar = campaign.generations.every((g) => source.generations.find((s) => s.gen === g.gen)?.sealedSha256 === g.sealedSha256);
  return sameSoFar ? (source.generations.find((g) => g.gen === gen) ?? null) : null;
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
