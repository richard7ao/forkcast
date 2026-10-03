/**
 * Demo wow factor: gives every ad in the demo campaign its own image. Ads that share a render (gen 0: the 6 levers of
 * a scene; gen 1: copy mutations inherit their parent's) get a fresh render of the SAME scene text from another angle,
 * so the copy still matches its image and the text-only panel's ratings still apply. Seals are recomputed, since a
 * generation's seal covers each ad's imageUrl. Rerunnable: renders already on disk are kept.
 * Writes data/campaigns/demo-epic.json and the demo-epic entry of fixtures/campaigns.json.
 * Usage (repo root): set -a; . ./.env; set +a; pnpm --filter api exec tsx scripts/diversify-demo.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Campaign, type Ad } from "@hack/contract";
import { sealGeneration } from "../src/lib/evolve";
import { downscale, editProductImage, HERO_PROMPT } from "../src/lib/image";
import { mapLimit } from "../src/lib/llm";

const ROOT = join(import.meta.dirname, "../../..");
const PUBLIC = join(ROOT, "apps/web/public");
const DIR = "/generated/campaigns/d87ed849";
const ANGLES = [
  "Shot from directly above as a flat lay.",
  "Low-angle hero shot, the pack large in the foreground.",
  "Tight close-up with a shallow depth of field.",
  "Wide shot that shows the whole setting.",
  "Side light at golden hour with long soft shadows.",
  "Three-quarter angle with the pack slightly tilted.",
];

const dataFile = join(ROOT, "data/campaigns/demo-epic.json");
const fixtureFile = join(ROOT, "fixtures/campaigns.json");
const campaign = Campaign.parse(JSON.parse(readFileSync(dataFile, "utf8")));

// One owner per render across the whole campaign (the first ad to show it); every other ad gets its own.
const owner = new Map<string, string>();
const decided = new Set<string>();
const jobs: { id: string; from: string; scene: string; angle: string }[] = [];
for (const g of campaign.generations) {
  for (const ad of g.ads) {
    if (decided.has(ad.id) || !ad.imageUrl) continue; // a carried survivor keeps what it got in its first generation
    decided.add(ad.id);
    if (!owner.has(ad.imageUrl)) {
      owner.set(ad.imageUrl, ad.id);
      continue;
    }
    const n = jobs.filter((j) => j.from === ad.imageUrl).length;
    jobs.push({ id: ad.id, from: ad.imageUrl, scene: ad.scene, angle: ANGLES[n % ANGLES.length]! });
  }
}
console.log(`${jobs.length} ads need their own render`);

const photo = await downscale(join(PUBLIC, DIR, "source-crop.jpg"), 1536);
const tmp = await mkdtemp(join(tmpdir(), "diversify-"));
const newUrl = new Map<string, string>();
let done = 0;
await mapLimit(jobs, 6, async (job) => {
  const url = `${DIR}/v-${job.id}.jpg`;
  if (!existsSync(join(PUBLIC, url))) {
    const { png } = await editProductImage({ photo, prompt: `${HERO_PROMPT} Scene: ${job.scene} ${job.angle}` });
    const pngFile = join(tmp, `${job.id}.png`);
    await writeFile(pngFile, png);
    await writeFile(join(PUBLIC, url), await downscale(pngFile, 1024)); // ~200 KB JPEG instead of a 1.4 MB PNG
  }
  newUrl.set(job.id, url);
  console.log(`${++done}/${jobs.length} ${url}`);
});
await rm(tmp, { recursive: true, force: true });

const withImage = (ad: Ad): Ad => ({ ...ad, imageUrl: newUrl.get(ad.id) ?? ad.imageUrl });
const generations = campaign.generations.map((g) => {
  const ads = g.ads.map(withImage);
  return { ...g, ads, sealedSha256: sealGeneration(g.gen, ads) };
});
const out: Campaign = { ...campaign, generations };
const imageOf = new Map(generations.flatMap((g) => g.ads.map((a) => [a.id, a.imageUrl] as const)));
console.log(`${imageOf.size} ads, ${new Set(imageOf.values()).size} distinct images`);

writeFileSync(dataFile, `${JSON.stringify(out, null, 2)}\n`);
const fixtures = JSON.parse(readFileSync(fixtureFile, "utf8")) as { campaigns: Campaign[] };
writeFileSync(fixtureFile, `${JSON.stringify({ ...fixtures, campaigns: fixtures.campaigns.map((c) => (c.id === out.id ? out : c)) }, null, 2)}\n`);
console.log("wrote data/campaigns/demo-epic.json and fixtures/campaigns.json");
