// Preflight before going live: is the OpenAI key valid, and do both text models honour strict JSON output?
// Usage (repo root): set -a; . ./.env; set +a; pnpm --filter api probe
import { z } from "zod";
import { chatJson, MODELS, usageTotals } from "../src/lib/llm";

const Out = z.object({ ok: z.boolean(), word: z.string() });
const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "word"],
  properties: { ok: { type: "boolean" }, word: { type: "string" } },
};

let failed = 0;
for (const model of [MODELS.copy, MODELS.panel]) {
  const started = Date.now();
  try {
    const r = await chatJson({ model, system: "Reply in JSON.", user: "Set ok to true and word to a snack.", name: "probe", jsonSchema, schema: Out });
    console.log(`✓ ${model}  ${Date.now() - started} ms  ${JSON.stringify(r)}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${model}  ${String(err).slice(0, 300)}`);
  }
}
console.log(`usage ${JSON.stringify(usageTotals)}`);
process.exit(failed ? 1 : 0);
