// Reads the claims printed on each Shelf pack, so ad copy can only use facts that are really there.
// Usage (repo root): set -a; . ./.env; set +a; pnpm --filter api facts [image ...]   (default: sample_images/*.jpeg)
// Relative paths resolve from the repo root. Writes data/shelf/<slug>.json (a contract Product) and data/shelf/index.json,
// merging every photo of the same pack. Nothing is written unless every photo was read. It overwrites the slugs it reads; files from
// an earlier run under other slugs stay (listed as a warning).
// Photos are only downscaled into a temp dir for the API call; they are never copied into the repo.
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Product } from "@hack/contract";
import { downscale } from "../src/lib/image";
import { chatJson, mapLimit, MODELS, usageTotals } from "../src/lib/llm";
import { mergeReadings, READING_JSON_SCHEMA, READING_SYSTEM, Reading, ShelfIndexEntry, type SourcedReading } from "../src/lib/shelf";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const OUT_DIR = join(ROOT, "data", "shelf");
// Not 1024: on the OOM back label (1536x2048 original) 1024 px lost the ingredient list and nutrition table,
// while 2048 px read every number correctly (checked against a full-resolution crop).
const MAX_PX = 2048;
const CONCURRENCY = 4;

type Outcome = { ok: true; item: SourcedReading } | { ok: false; source: string; error: string };

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sourceName = (file: string) => (relative(ROOT, file).startsWith("..") ? file : relative(ROOT, file));

const args = process.argv.slice(2);
const images = args.length
  ? args.map((p) => resolve(ROOT, p))
  : (await readdir(join(ROOT, "sample_images")))
      .filter((f) => /\.jpe?g$/i.test(f))
      .sort()
      .map((f) => join(ROOT, "sample_images", f));
if (images.length === 0) {
  console.error("no images: pass paths, or put .jpeg files in sample_images/");
  process.exit(1);
}

const outcomes = await mapLimit(images, CONCURRENCY, async (file, i): Promise<Outcome> => {
  const tag = `[${i + 1}/${images.length}] ${basename(file)}`;
  try {
    const jpeg = await downscale(file, MAX_PX);
    const reading = await chatJson({
      model: MODELS.copy,
      system: READING_SYSTEM,
      user: [
        { type: "text", text: "Read this pack." },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } },
      ],
      name: "pack_reading",
      jsonSchema: READING_JSON_SCHEMA,
      schema: Reading,
    });
    console.log(`${tag}  ${reading.brand} | ${reading.name}  ${reading.view}, ${reading.confidence}, ${reading.facts.length} facts${reading.notes ? `  (${reading.notes})` : ""}`);
    return { ok: true, item: { source: sourceName(file), reading } };
  } catch (err) {
    console.error(`${tag}  FAILED ${String(err).slice(0, 300)}`);
    return { ok: false, source: sourceName(file), error: String(err) };
  }
});

// All or nothing: a partial index.json would silently drop the products whose photos failed.
const failed = outcomes.flatMap((o) => (o.ok ? [] : [o]));
if (failed.length) {
  console.error(`FAILED ${failed.length}/${images.length} photos, nothing written (re-run to retry): ${failed.map((f) => basename(f.source)).join(", ")}`);
  process.exit(1);
}

const { candidates, unidentified } = mergeReadings(outcomes.flatMap((o) => (o.ok ? [o.item] : [])));

await mkdir(OUT_DIR, { recursive: true });
await Promise.all(candidates.map(({ entry, product }) => writeFile(join(OUT_DIR, `${entry.slug}.json`), json(Product.parse(product)))));
await writeFile(join(OUT_DIR, "index.json"), json(candidates.map(({ entry }) => ShelfIndexEntry.parse(entry))));

const written = new Set(["index.json", ...candidates.map(({ entry }) => `${entry.slug}.json`)]);
const stale = (await readdir(OUT_DIR)).filter((f) => f.endsWith(".json") && !written.has(f));

console.table(
  candidates.map(({ entry }) => ({
    slug: entry.slug,
    name: `${entry.brand} ${entry.name}`.trim(),
    facts: entry.factCount,
    confidence: entry.confidence,
    photos: entry.sourceImages.length,
  })),
);
if (stale.length) console.warn(`left in place from earlier runs (not in index.json): ${stale.join(", ")}`);
if (unidentified.length) {
  console.warn(`${unidentified.length} photos name no product (brand or name unreadable), so their facts are not attributed to any candidate:`);
  for (const { source, reading } of unidentified) {
    console.warn(`  ${basename(source)}  brand=${JSON.stringify(reading.brand)} name=${JSON.stringify(reading.name)}  ${reading.facts.length} facts`);
  }
}
console.log(`wrote ${candidates.length} candidates to ${relative(ROOT, OUT_DIR)}/  usage ${JSON.stringify(usageTotals)}`);
