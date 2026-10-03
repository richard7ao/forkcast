import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { endpoints, type EndpointName } from "@hack/contract";
import { resolveFixture } from "@hack/contract/fixtures";

/**
 * The reason parallel lanes can't silently diverge: every fixture is parsed
 * with the same schema the API handler and the browser client use. A frontend
 * agent that builds against a fixture is building against the real contract.
 * Run as `pnpm fixtures:validate`, and keep it green -- a red check here means
 * somebody's work is already wrong, minutes before you'd find out by clicking.
 */
const dir = dirname(fileURLToPath(import.meta.url));
let failed = 0;

for (const [name, ep] of Object.entries(endpoints) as [EndpointName, (typeof endpoints)[EndpointName]][]) {
  // Detail endpoints need a real id, so sample one from the fixture itself.
  let params: Record<string, string> = {};
  if ("pickBy" in ep) {
    const key = (ep as { pickBy: string }).pickBy;
    const raw = JSON.parse(readFileSync(join(dir, `${ep.fixture}.json`), "utf8")) as Record<string, unknown>;
    const first = (raw[ep.fixture] as Record<string, unknown>[] | undefined)?.[0];
    if (!first) { console.error(`✗ ${name}: fixtures/${ep.fixture}.json is empty`); failed++; continue; }
    params = { [key]: String(first[key]) };
  }

  try {
    ep.response.parse(resolveFixture(name, params, dir));
    console.log(`✓ ${name}  ${ep.method} ${ep.path}`);
  } catch (err) {
    console.error(`✗ ${name}  ${ep.method} ${ep.path}\n  ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

if (failed > 0) { console.error(`\n${failed} endpoint(s) have fixtures that do not match the contract.`); process.exit(1); }
console.log(`\nAll ${Object.keys(endpoints).length} endpoints have contract-valid fixtures.`);
