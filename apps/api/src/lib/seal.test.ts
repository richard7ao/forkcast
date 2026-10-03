import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { ForecastFile } from "../data/files";
import { canonicalJson, sealForecast, verifySeal } from "./seal";

const unsealed: Omit<ForecastFile, "sealedAt" | "sha256"> = {
  round: 1,
  model: "gpt-test",
  personasPerSegment: 1,
  perSegment: { "r1-value": { student: 1, young_pro: 0, parent: 0, fitness: 1 } },
  answers: [
    { personaId: "student-1", segment: "student", variantId: "r1-value", decision: "tap", reason: "Cheap and filling." },
    { personaId: "young_pro-1", segment: "young_pro", variantId: "r1-value", decision: "scroll", reason: "Not for me." },
    { personaId: "parent-1", segment: "parent", variantId: "r1-value", decision: "scroll", reason: "Too busy." },
    { personaId: "fitness-1", segment: "fitness", variantId: "r1-value", decision: "tap", reason: "Protein snack." },
  ],
  pooledEqual: { "r1-value": 0.5 },
  pick: "r1-value",
};
const now = new Date("2026-10-03T12:50:00.000Z");

/** The forecast as written to disk and read back. */
const saved = (): ForecastFile => JSON.parse(JSON.stringify(sealForecast(unsealed, now), null, 2));

test("a sealed forecast read back from disk re-hashes to its own sha256, whatever its key order", () => {
  const file = saved();
  assert.equal(verifySeal(file), true);
  assert.equal(verifySeal(Object.fromEntries(Object.entries(file).reverse()) as ForecastFile), true);
});

test("flipping one probability breaks the seal, so a forecast cannot be edited after the votes arrive", () => {
  const file = saved();
  assert.equal(verifySeal({ ...file, perSegment: { "r1-value": { ...file.perSegment["r1-value"]!, student: 0 } } }), false);
});

test("editing a panel reason or the headline pick breaks the seal too: both are part of what was pre-registered", () => {
  const file = saved();
  assert.equal(verifySeal({ ...file, answers: file.answers.map((a, i) => (i === 0 ? { ...a, reason: "Edited." } : a)) }), false);
  assert.equal(verifySeal({ ...file, pick: "r1-scarcity" }), false);
});

test("the hash is the documented recipe (sha256 of sorted-key JSON without sha256), so anyone can check it without this code", () => {
  const { sha256, ...body } = saved();
  assert.equal(body.sealedAt, "2026-10-03T12:50:00.000Z");
  assert.equal(canonicalJson({ b: [2, 1], a: { d: 1, c: null } }), '{"a":{"c":null,"d":1},"b":[2,1]}');
  assert.equal(sha256, createHash("sha256").update(canonicalJson(body)).digest("hex"));
});

test("a forecast missing a panel segment cannot be sealed, so a gap is never pre-registered", () => {
  const gap = { ...unsealed, perSegment: { "r1-value": { student: 1, young_pro: 0, parent: 0 } } };
  assert.throws(() => sealForecast(gap as unknown as typeof unsealed, now), /fitness/);
});
