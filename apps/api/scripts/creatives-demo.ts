/**
 * Demo creatives: re-renders every ad in the demo campaign as a designed Meta creative with its own headline set into
 * the image, rotating through 12 ad formats common in snack-brand ads (typographic poster, checklist, before/after,
 * big number, recipe card, story sticker, ...), so no two tiles look alike. Truth rules hold: the only text is the
 * ad's own truth-guarded headline and real pack facts; no stars, reviews, prices or badges. Seals are recomputed,
 * since a generation's seal covers each ad's imageUrl. Rerunnable: creatives already on disk are kept.
 * Usage (repo root): set -a; . ./.env; set +a; pnpm --filter api exec tsx scripts/creatives-demo.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Campaign, type Ad } from "@hack/contract";
import { sealGeneration } from "../src/lib/evolve";
import { downscale, editProductImage } from "../src/lib/image";
import { mapLimit } from "../src/lib/llm";

const ROOT = join(import.meta.dirname, "../../..");
const PUBLIC = join(ROOT, "apps/web/public");
const DIR = "/generated/campaigns/d87ed849";
const BASE =
  "Design a scroll-stopping square Meta ad creative for this exact product. Keep the pack's packaging, logo, colours and label text exactly as in the photo; never alter the pack. Add ONLY the ad text given below, spelled exactly, in bold modern typography that reads well on a phone. No other words, no prices, no star ratings, no reviews, no badges, no extra logos, no people.";
const FORMATS = [
  "Bold typographic poster on a saturated solid colour that suits the pack: the ad text huge across the top, the pack below.",
  "Night campfire scene in warm firelight: the ad text in big white letters with one key word in bright orange.",
  "Clean cream card: a ticked checklist of these pack facts on the left (Gluten free, 0g fat, 300g bag), the pack on the right, the ad text as a bold title above.",
  "Split screen: on the left a plain white marshmallow labelled BEFORE, on the right a golden toasted s'more labelled AFTER, the pack between them and the ad text at the top.",
  "A giant '0g fat' number graphic beside the pack, the ad text underneath.",
  "Overhead flat lay of s'mores ingredients (biscuits, chocolate, marshmallows) around the pack, the ad text on a sticker-style label.",
  "Instagram story look: a casual phone-camera photo of the pack at a backyard BBQ, the ad text as a white rounded story sticker.",
  "Recipe card: three simple illustrated steps for grilled s'mores beside the pack, the ad text as the card title.",
  "Pop-art collage with halftone dots and bold comic colours, the ad text in a speech bubble.",
  "Minimal premium: soft pastel pink background, the pack centred with a soft shadow, the ad text in elegant serif letters.",
  "Dark moody studio with one spotlight on the pack, the ad text in glowing neon letters.",
  "Picnic blanket in bright daylight with the pack, the ad text in a hand-drawn brush font.",
];

const dataFile = join(ROOT, "data/campaigns/demo-epic.json");
const fixtureFile = join(ROOT, "fixtures/campaigns.json");
const campaign = Campaign.parse(JSON.parse(readFileSync(dataFile, "utf8")));

// Each ad id once (carried survivors repeat across generations), in campaign order so neighbouring tiles differ.
const ads = [...new Map(campaign.generations.flatMap((g) => g.ads).map((ad) => [ad.id, ad])).values()];
console.log(`${ads.length} creatives to make`);

const photo = await downscale(join(PUBLIC, DIR, "source-crop.jpg"), 1536);
const tmp = await mkdtemp(join(tmpdir(), "creatives-"));
const newUrl = new Map<string, string>();
let done = 0;
await mapLimit(ads, 7, async (ad, i) => {
  const url = `${DIR}/c-${ad.id}.jpg`;
  if (!existsSync(join(PUBLIC, url))) {
    const prompt = `${BASE} Format: ${FORMATS[i % FORMATS.length]} Scene mood: ${ad.scene} Ad text: "${ad.headline}"`;
    const { png } = await editProductImage({ photo, prompt });
    const pngFile = join(tmp, `${ad.id}.png`);
    await writeFile(pngFile, png);
    await writeFile(join(PUBLIC, url), await downscale(pngFile, 1024));
  }
  newUrl.set(ad.id, url);
  console.log(`${++done}/${ads.length} ${url}`);
});
await rm(tmp, { recursive: true, force: true });

const withImage = (ad: Ad): Ad => ({ ...ad, imageUrl: newUrl.get(ad.id) ?? ad.imageUrl });
const generations = campaign.generations.map((g) => {
  const genAds = g.ads.map(withImage);
  return { ...g, ads: genAds, sealedSha256: sealGeneration(g.gen, genAds) };
});
const out: Campaign = { ...campaign, generations };
writeFileSync(dataFile, `${JSON.stringify(out, null, 2)}\n`);
const fixtures = JSON.parse(readFileSync(fixtureFile, "utf8")) as { campaigns: Campaign[] };
writeFileSync(fixtureFile, `${JSON.stringify({ ...fixtures, campaigns: fixtures.campaigns.map((c) => (c.id === out.id ? out : c)) }, null, 2)}\n`);
console.log(`wrote data/campaigns/demo-epic.json and fixtures/campaigns.json (${newUrl.size} creatives)`);
