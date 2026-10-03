// Turns a hand-held product photo into a clean ad hero with a gpt-image edit. Every variant of a round shows this one image.
// Usage (repo root): set -a; . ./.env; set +a
//   pnpm --filter api visual --image sample_images/<photo>.jpeg --out apps/web/public/generated/candidates/<slug>.png [--round N] [--quality low|medium|high|auto]
// Relative paths resolve from the repo root; --out must be a .png under apps/web/public/generated/.
// With --round N the file is also registered as round N's hero in DATA_DIR/generated.json, which the store serves as product.imageUrl.
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { dataDir, GeneratedFile } from "../src/data/files";
import { DEFAULT_QUALITY, downscale, editProductImage, HERO_PROMPT, IMAGE_QUALITIES, withHero } from "../src/lib/image";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PUBLIC_DIR = join(ROOT, "apps", "web", "public");
const MAX_PX = 1536;

const USAGE = `usage: pnpm --filter api visual --image <photo> --out apps/web/public/generated/<file>.png [--round N] [--quality ${IMAGE_QUALITIES.join("|")}]`;
const fail = (message: string): never => {
  console.error(`${message}\n${USAGE}`);
  process.exit(1);
};
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const { values } = parseArgs({ options: { image: { type: "string" }, out: { type: "string" }, round: { type: "string" }, quality: { type: "string" }, scene: { type: "string" } } });
if (!values.image || !values.out) fail("--image and --out are required");

const image = resolve(ROOT, values.image!);
const out = resolve(ROOT, values.out!);
const underGenerated = relative(join(PUBLIC_DIR, "generated"), out);
if (!out.endsWith(".png") || underGenerated.startsWith("..") || isAbsolute(underGenerated)) {
  fail(`--out must be a .png under apps/web/public/generated/ (resolved to ${out})`);
}
const round = values.round === undefined ? undefined : Number(values.round);
if (round !== undefined && (!Number.isInteger(round) || round < 1)) fail(`--round must be a positive integer (got ${values.round})`);
const quality = IMAGE_QUALITIES.find((q) => q === (values.quality ?? DEFAULT_QUALITY)) ?? fail(`--quality must be one of ${IMAGE_QUALITIES.join(", ")} (got ${values.quality})`);
await stat(image).catch(() => fail(`image not found: ${image}`));

// DATA_DIR is documented relative to apps/api, so resolve it there whatever the caller's cwd is.
const generatedFile = join(resolve(join(ROOT, "apps", "api"), dataDir()), "generated.json");
const readGenerated = (): Promise<GeneratedFile> =>
  readFile(generatedFile, "utf8").then(
    (text) => GeneratedFile.parse(JSON.parse(text)),
    (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return { heroByRound: {} };
      throw err;
    },
  );
// A corrupt generated.json is for a human to fix, never to overwrite: fail before the paid render, not after.
if (round !== undefined) await readGenerated();

const started = performance.now();
// --scene: an ad scene for this variant; the packaging-fidelity rules in HERO_PROMPT always apply.
const prompt = values.scene ? `${HERO_PROMPT} Scene: ${values.scene}` : undefined;
const { png, usage } = await editProductImage({ photo: await downscale(image, MAX_PX), quality, prompt });
await mkdir(dirname(out), { recursive: true });
await writeFile(out, png);
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`wrote ${relative(ROOT, out)}  ${Math.round(png.length / 1024)} KB  ${seconds} s  quality=${quality}`);
if (usage) console.log(`usage ${JSON.stringify(usage)}`);

if (round !== undefined) {
  const url = `/${relative(PUBLIC_DIR, out)}`;
  const current = await readGenerated(); // re-read: another render may have registered a round meanwhile
  await mkdir(dirname(generatedFile), { recursive: true });
  await writeFile(generatedFile, json(withHero(current, round, url)));
  console.log(`round ${round} hero -> ${url} (${relative(ROOT, generatedFile)})`);
}
console.log("CHECK: compare label text with the real pack before using");
