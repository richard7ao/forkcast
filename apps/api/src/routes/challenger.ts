import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Hono } from "hono";
import { ChallengerRequest, type ResponseOf } from "@hack/contract";
import { dataDir, type VariantsFile } from "../data/files";
import { store } from "../data/store";
import { adminTokenConfigured, buildEvidence, buildRound2, generateChallengers } from "../lib/challenger";
import { ensurePersonas, runForecast } from "../lib/forecast";
import { buildResults } from "../lib/results";

const rejected = (error: string): ResponseOf<"challenger"> => ({ ok: false, error });

/** Creates the file and refuses to overwrite one ("wx"), as scripts/forecast.ts does for a seal. */
function createJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

/** One generation at a time: a double-click must not write two different round 2s. */
let running = false;

/**
 * Admin only. Writes round 2 from the round-1 evidence: the unchanged winner plus 2 challengers, and its sealed forecast.
 * Nothing is written until every LLM step has succeeded. It never activates round 2: that happens separately, once the
 * seal is committed and pushed, so no vote can land before the public seal.
 */
export const challengerRoutes = new Hono().post("/challenger", async (c) => {
  const token = process.env.ADMIN_TOKEN;
  if (!adminTokenConfigured(token)) return c.json(rejected("admin token not configured"), 401);
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json(rejected("body is not valid JSON"), 400);
  }
  const parsed = ChallengerRequest.safeParse(raw);
  if (!parsed.success) return c.json(rejected(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")), 400);
  if (parsed.data.adminToken !== token) return c.json(rejected("unauthorized"), 401);
  if (running) return c.json(rejected("challenger already running"), 409);

  const dir = dataDir();
  const variantsPath = join(dir, "variants", "round-2.json");
  const forecastPath = join(dir, "forecasts", "round-2.json");
  // r2-* votes mean an earlier round 2 went live; sealing new copy under those ids would break pre-registration.
  const round2Exists = existsSync(variantsPath) || existsSync(forecastPath) || store.votes().some((v) => v.variantId.startsWith("r2-"));
  if (round2Exists) return c.json(rejected("round 2 already exists"), 409);

  // The same round-1 view as GET /results (phone tests before opensAt excluded), so the challenger answers the dashboard's winner.
  const round1 = store.variants(1) ?? [];
  const results = buildResults({
    votes: store.votes(),
    variantsByRound: { 1: round1 },
    forecastsByRound: { 1: store.forecast(1) },
    opensAt: store.state().opensAt,
    activeRound: 1,
    now: new Date(),
  });
  const evidence = buildEvidence(results, round1);
  const { winner } = evidence;
  if (!winner) return c.json(rejected("not enough round-1 evidence yet (need a variant with n >= 10)"), 422);

  running = true;
  try {
    const product = store.product(2);
    const variants = buildRound2(winner, await generateChallengers(evidence, product));
    const forecast = await runForecast({
      round: 2,
      product,
      variants,
      personas: await ensurePersonas(dir),
      warn: (message) => console.warn(`!!! round 2: ${message} !!!`),
    });
    createJson(variantsPath, { round: 2, variants } satisfies VariantsFile);
    createJson(forecastPath, forecast);
    console.log(`sealed round 2 sha256=${forecast.sha256.slice(0, 8)} at ${forecast.sealedAt}: commit and push it, then activate round 2`);
    const body: ResponseOf<"challenger"> = { ok: true, round: 2, variants };
    return c.json(body);
  } catch (err) {
    console.error("challenger failed:", err);
    return c.json(rejected(err instanceof Error ? err.message : String(err)), 500);
  } finally {
    running = false;
  }
});
