import assert from "node:assert/strict";
import { test } from "node:test";
import { PANEL_SEGMENTS } from "@hack/contract";
import type { PanelAnswer, PanelSegment } from "../data/files";
import { aggregate, personaOrder, pooledPick } from "./panel";

const ids = ["r1-social_proof", "r1-scarcity", "r1-health_halo", "r1-indulgence", "r1-provenance", "r1-value"];
const panel = PANEL_SEGMENTS.flatMap((segment) => Array.from({ length: 10 }, (_, i) => `${segment}-${i + 1}`));

const answer = (personaId: string, segment: PanelSegment, variantId: string, tap: boolean): PanelAnswer => ({
  personaId,
  segment,
  variantId,
  decision: tap ? "tap" : "scroll",
  reason: "",
});

test("a persona sees the same order on every run, so a re-asked or re-run panel is reproducible", () => {
  assert.deepEqual(personaOrder("student-1", 1, ids), personaOrder("student-1", 1, ids));
});

test("the shuffle only reorders: no ad is dropped or shown twice, and the caller's list is untouched", () => {
  const input = [...ids];
  for (const id of panel) assert.deepEqual([...personaOrder(id, 1, input)].sort(), [...ids].sort());
  assert.deepEqual(input, ids);
});

test("position bias is spread: across the 40-persona panel every ad is somebody's first", () => {
  assert.equal(new Set(panel.map((id) => personaOrder(id, 1, ids)[0])).size, ids.length);
});

test("each cell is that segment's taps over that segment's answers for that ad, so nothing leaks between cells", () => {
  // 3 of 10 students and every fitness persona tap r1-value; everyone taps r1-scarcity, which must not count.
  const answers = PANEL_SEGMENTS.flatMap((segment) =>
    Array.from({ length: 10 }, (_, i) => [
      answer(`${segment}-${i}`, segment, "r1-value", segment === "fitness" || (segment === "student" && i < 3)),
      answer(`${segment}-${i}`, segment, "r1-scarcity", true),
    ]).flat(),
  );
  assert.deepEqual(aggregate(answers, [{ id: "r1-value" }]), { "r1-value": { student: 0.3, young_pro: 0, parent: 0, fitness: 1 } });
});

test("the sealed pick is the equal-weight mean's argmax, so a student-heavy room cannot move the AI's bet", () => {
  const perSegment = {
    "r1-indulgence": { student: 1, young_pro: 0, parent: 0, fitness: 0 },
    "r1-value": { student: 0.3, young_pro: 0.3, parent: 0.3, fitness: 0.3 },
  };
  assert.deepEqual(pooledPick(perSegment, [{ id: "r1-indulgence" }, { id: "r1-value" }]), {
    pooledEqual: { "r1-indulgence": 0.25, "r1-value": 0.3 },
    pick: "r1-value",
  });
});

test("a tie goes to the variant listed first, never to float summation order", () => {
  const perSegment = {
    a: { student: 0.12, young_pro: 0.36, parent: 0.84, fitness: 0.28 },
    b: { student: 0.84, young_pro: 0.28, parent: 0.12, fitness: 0.36 },
  };
  assert.equal(pooledPick(perSegment, [{ id: "a" }, { id: "b" }]).pick, "a");
  assert.equal(pooledPick(perSegment, [{ id: "b" }, { id: "a" }]).pick, "b");
});

test("an empty variant x segment cell throws, so a gap is never sealed as a 0% forecast", () => {
  const answers = (["student", "young_pro", "parent"] as const).map((segment) => answer(`${segment}-1`, segment, "r1-value", true));
  assert.throws(() => aggregate(answers, [{ id: "r1-value" }]), /r1-value x fitness/);
});
