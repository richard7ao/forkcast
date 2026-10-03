// Recomputes a sealed forecast's sha256 and compares it with the stored one; exit 1 on MISMATCH or a missing file.
// Usage (apps/api): node --import tsx scripts/verify-seal.ts --round N
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { dataDir, ForecastFile } from "../src/data/files";
import { verifySeal } from "../src/lib/seal";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { values } = parseArgs({ options: { round: { type: "string" } } });
const parsedRound = z.coerce.number().int().min(1).safeParse(values.round);
if (!parsedRound.success) fail("usage: verify-seal.ts --round N");
const round = parsedRound.data;
const file = join(dataDir(), "forecasts", `round-${round}.json`);
if (!existsSync(file)) fail(`MISSING ${file}`);

// Hash the raw JSON, not the zod-parsed copy, so a field added after sealing also counts as tampering.
const raw = JSON.parse(readFileSync(file, "utf8"));
const parsed = ForecastFile.safeParse(raw);
if (!parsed.success) fail(`MISMATCH round ${round}: ${file} is not a valid forecast file\n${parsed.error.message}`);
if (!verifySeal(raw)) fail(`MISMATCH round ${round}: ${file} does not hash to its sha256 ${parsed.data.sha256.slice(0, 8)}`);
console.log(`ok round ${round} sha256=${parsed.data.sha256.slice(0, 8)} sealedAt=${parsed.data.sealedAt}`);
