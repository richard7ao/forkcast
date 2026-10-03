// Seals DATA_DIR/forecasts/round-N.json: the persona panel's P(tap) per variant and segment, hashed before any vote.
// Usage (apps/api, after `set -a; . ../../.env; set +a`): node --import tsx scripts/forecast.ts --round N [--force]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { PANEL_SEGMENTS } from "@hack/contract";
import { dataDir, VariantsFile, VoteLine } from "../src/data/files";
import { ensurePersonas, loadProduct, runForecast } from "../src/lib/forecast";
import { usageTotals } from "../src/lib/llm";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const started = Date.now();
const { values } = parseArgs({ options: { round: { type: "string" }, force: { type: "boolean", default: false } } });
const parsedRound = z.coerce.number().int().min(1).safeParse(values.round);
if (!parsedRound.success) fail("usage: forecast.ts --round N [--force]");
const round = parsedRound.data;
const dir = dataDir();
const out = join(dir, "forecasts", `round-${round}.json`);

if (existsSync(out)) {
  if (!values.force) fail(`refusing: round ${round} is already sealed (${out}). Re-sealing breaks pre-registration.`);
  console.error(`\n!!! --force: RE-SEALING round ${round}. This breaks pre-registration if anyone has seen the old seal. !!!\n`);
}

const variantsPath = join(dir, "variants", `round-${round}.json`);
if (!existsSync(variantsPath)) fail(`missing ${variantsPath}: run scripts/generate.ts --round ${round} first`);
const { variants } = VariantsFile.parse(JSON.parse(readFileSync(variantsPath, "utf8")));

// Pre-registration: no forecast may be sealed once any vote for this round exists (--force does not override this).
const roundIds = new Set(variants.map((v) => v.id));
const votesPath = join(dir, "votes.jsonl");
const VotedVariant = VoteLine.pick({ variantId: true });
const lines = existsSync(votesPath) ? readFileSync(votesPath, "utf8").split("\n").filter((line) => line.trim()) : [];
if (lines.some((line) => roundIds.has(VotedVariant.parse(JSON.parse(line)).variantId))) {
  fail(`refusing: votes.jsonl already holds round ${round} votes, so a forecast sealed now would not be pre-registered`);
}

const { product, placeholder } = loadProduct(dir);
if (placeholder) console.error("\n!!! PLACEHOLDER PRODUCT: write data/product.json !!!\n");

const personas = await ensurePersonas(dir);
const imageCount = variants.filter((v) => v.imageUrl).length;
if (!imageCount) console.error("\n!!! NO VARIANT HAS AN imageUrl: this forecast is TEXT-ONLY !!!\n");
let textOnly = !imageCount;
const forecast = await runForecast({
  round,
  product,
  variants,
  personas,
  warn: (message) => {
    textOnly = true;
    console.error(`\n!!! ${message} !!!\n`);
  },
});
if (!textOnly) console.log(`panel saw ${imageCount} ad image(s)`);
mkdirSync(join(dir, "forecasts"), { recursive: true });
writeFileSync(out, `${JSON.stringify(forecast, null, 2)}\n`, { flag: values.force ? "w" : "wx" });

for (const [id, p] of Object.entries(forecast.perSegment)) {
  const segments = PANEL_SEGMENTS.map((segment) => `${segment} ${p[segment].toFixed(2)}`).join("  ");
  console.log(`${id.padEnd(18)} pooled ${forecast.pooledEqual?.[id]?.toFixed(3)}  ${segments}`);
}
console.log(`pick ${forecast.pick}`);
const tokens = usageTotals.promptTokens + usageTotals.completionTokens;
const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`sealed round ${round} sha256=${forecast.sha256.slice(0, 8)} at ${forecast.sealedAt} (${usageTotals.calls} calls, ${tokens} tokens, ${seconds}s)`);
