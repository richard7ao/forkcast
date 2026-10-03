/**
 * Rebuilds demo-epic as 20 + 20 ads with no paid calls: reuses the existing renders and stored panel fitness.
 * Gen 0: 4 of the original survivors plus 16 others spread over every lever, re-run until those 4 survive.
 * Gen 1: those 4 survivors plus their 16 children from the old gen 1. Seals are recomputed.
 * Writes data/campaigns/demo-epic.json and the demo-epic entry of fixtures/campaigns.json.
 * Usage (repo root): pnpm --filter api exec tsx scripts/twenty-demo.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Campaign, Lever, type Ad } from "@hack/contract";
import { runExperiment, sealGeneration, seedOf } from "../src/lib/evolve";
import { seededRandom } from "../src/lib/stats";

const root = new URL("../../../", import.meta.url);
const dataFile = new URL("data/campaigns/demo-epic.json", root);
const fixtureFile = new URL("fixtures/campaigns.json", root);
const demo = Campaign.parse(JSON.parse(readFileSync(dataFile, "utf8")));
const [old0, old1] = demo.generations as [NonNullable<(typeof demo.generations)[0]>, NonNullable<(typeof demo.generations)[1]>];
const fresh = (a: Ad): Ad => ({ ...a, experiment: null, status: "screening" });

const keep = old0.survivorIds.slice(0, 4);
const others = old0.ads.filter((a) => !keep.includes(a.id));
// 16 others, round-robin over the levers so every lever is in the experiment.
const byLever = Lever.options.map((lever) => others.filter((a) => a.lever === lever));
const pool: Ad[] = [];
for (let k = 0; pool.length < others.length; k++) for (const ads of byLever) if (ads[k]) pool.push(ads[k]!);
let rest = pool.slice(0, 16);
const spare = pool.slice(16);

const rand = seededRandom(20);
const ordered = (ids: readonly string[]) => [...ids].sort().join();
let gen0 = runExperiment(0, [...old0.ads.filter((a) => keep.includes(a.id)), ...rest].map(fresh), seedOf("demo-epic:0:delivery"));
for (let tries = 0; ordered(gen0.survivorIds) !== ordered(keep); tries++) {
  if (tries > 5000) throw new Error(`no swap made ${keep.join(", ")} the survivors`);
  // Swap an intruding survivor (or a random one) for a spare ad.
  const intruder = gen0.survivorIds.find((id) => !keep.includes(id));
  const out = intruder ? rest.findIndex((a) => a.id === intruder) : Math.floor(rand() * rest.length);
  const inn = Math.floor(rand() * spare.length);
  [rest[out], spare[inn]] = [spare[inn]!, rest[out]!];
  rest = [...rest];
  gen0 = runExperiment(0, [...old0.ads.filter((a) => keep.includes(a.id)), ...rest].map(fresh), seedOf("demo-epic:0:delivery"));
}

const ads1 = old1.ads.filter((a) => keep.includes(a.id) || keep.includes(a.parentIds[0] ?? ""));
if (ads1.length !== 20) throw new Error(`gen 1 has ${ads1.length} ads, want 20`);
const gen1 = runExperiment(1, ads1.map(fresh), seedOf("demo-epic:1:delivery"));

const out: Campaign = Campaign.parse({
  ...demo,
  generations: [
    { ...old0, ...gen0, sealedSha256: sealGeneration(0, gen0.ads) },
    { ...old1, ...gen1, sealedSha256: sealGeneration(1, gen1.ads) },
  ],
  winnerId: gen1.survivorIds[0]!,
});
writeFileSync(dataFile, `${JSON.stringify(out, null, 2)}\n`);
const fixtures = JSON.parse(readFileSync(fixtureFile, "utf8"));
fixtures.campaigns = fixtures.campaigns.map((c: Campaign) => (c.id === out.id ? out : c));
writeFileSync(fixtureFile, `${JSON.stringify(fixtures, null, 2)}\n`);
console.log(`gen 0 survivors: ${gen0.survivorIds.join(", ")}\ngen 1 survivors: ${gen1.survivorIds.join(", ")}\nwinner: ${out.winnerId}`);
