import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ResultsResponse, VariantsResponse, type Segment, type Variant } from "@hack/contract";
import type { ForecastFile, SegmentProbabilities, VoteLine } from "../data/files";
import { openStore } from "../data/store";
import { votesRoutesFor } from "../routes/votes";
import { buildResults } from "./results";

const NOW = new Date("2026-10-03T14:30:00Z");

function near(actual: number | null, expected: number, tolerance: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

function find<T>(items: readonly T[], match: (item: T) => boolean): T {
  const hit = items.find(match);
  assert.ok(hit !== undefined, "no matching item");
  return hit;
}

const variant = (id: string): Variant => ({ id, round: 1, lever: "value", headline: id, body: id, cta: "Shop now", rationale: id, parentId: null });

const LUNCH = "2026-10-03T13:05:00.000Z";

const vote = (voterId: string, segment: Segment, variantId: string, tapped: boolean, at = LUNCH): VoteLine => ({ voterId, segment, variantId, tapped, dwellMs: 1500, at });

/** n voters of one segment rating one ad; the first `taps` of them tap. Same prefix = same voters. */
const crowd = (prefix: string, segment: Segment, variantId: string, n: number, taps: number) =>
  Array.from({ length: n }, (_, i) => vote(`${prefix}-voter-${i}`, segment, variantId, i < taps));

const flat = (p: number): SegmentProbabilities => ({ student: p, young_pro: p, parent: p, fitness: p });

const sealed = (perSegment: Record<string, SegmentProbabilities>, pick?: string): ForecastFile => ({
  round: 1, model: "test-model", personasPerSegment: 10, perSegment, answers: [], sealedAt: "2026-10-03T12:50:00Z", sha256: "0".repeat(64),
  ...(pick ? { pick } : {}),
});

function build(votes: readonly VoteLine[], ids: string[], perSegment?: Record<string, SegmentProbabilities>, pick?: string) {
  return buildResults({
    votes,
    variantsByRound: { 1: ids.map(variant) },
    forecastsByRound: { 1: perSegment ? sealed(perSegment, pick) : null },
    activeRound: 1,
    now: NOW,
  });
}

const scorecard = (results: ResultsResponse) => find(results.scorecards, (s) => s.round === 1);
const result = (results: ResultsResponse, id: string) => find(results.variants, (v) => v.variantId === id);

test("a repeated (voterId, variantId) counts once, even after a restart: ballot stuffing must not move results", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "fk-store-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const ballot = vote("stuffer-0001", "student", "r1-a", true);

  const store = openStore(dir);
  assert.deepEqual(store.addVote(ballot), { duplicate: false });
  assert.deepEqual(store.addVote({ ...ballot, tapped: false }), { duplicate: true });
  const restarted = openStore(dir);
  assert.deepEqual(restarted.addVote(ballot), { duplicate: true });

  assert.equal(readFileSync(join(dir, "votes.jsonl"), "utf8").trim().split("\n").length, 1);
  const results = build(restarted.votes(), ["r1-a"]);
  assert.equal(results.votes, 1);
  assert.equal(result(results, "r1-a").human.taps, 1);
  assert.equal(result(results, "r1-a").human.n, 1);
});

test("the store re-reads data files on every call and names a corrupt one: seal and challenger scripts write under a running server", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "fk-store-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = openStore(dir);
  assert.equal(store.activeRound(), 1);

  writeFileSync(join(dir, "state.json"), JSON.stringify({ activeRound: 2 }));
  writeFileSync(join(dir, "product.json"), JSON.stringify({ brand: "B", name: "N", price: "£1", imageUrl: "/product.jpg", facts: [] }));
  writeFileSync(join(dir, "generated.json"), JSON.stringify({ heroByRound: { "2": "/generated/round-2.png" } }));
  assert.equal(store.activeRound(), 2);
  assert.equal(store.product(2).imageUrl, "/generated/round-2.png");
  assert.equal(store.product(1).imageUrl, "/product.jpg");
  assert.equal(store.variants(2), null);

  mkdirSync(join(dir, "forecasts"));
  writeFileSync(join(dir, "forecasts", "round-1.json"), "{ not json");
  assert.throws(() => store.forecast(1), /forecasts\/round-1\.json/);
  writeFileSync(join(dir, "votes.jsonl"), "garbage\n");
  assert.throws(() => openStore(dir), /votes\.jsonl:1/);
});

test("POST /votes refuses every vote until the round's forecast is sealed: no vote may predate its pre-registration", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "fk-route-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "variants"));
  writeFileSync(join(dir, "variants", "round-1.json"), JSON.stringify({ round: 1, variants: [variant("r1-a")] }));
  const app = votesRoutesFor(openStore(dir));
  const post = (body: unknown) =>
    app.request("/votes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const ballot = vote("early-bird-01", "student", "r1-a", true);

  const closed = await post(ballot);
  assert.equal(closed.status, 400);
  assert.deepEqual(await closed.json(), { ok: false, duplicate: false, error: "round not open" });
  assert.equal(existsSync(join(dir, "votes.jsonl")), false);

  mkdirSync(join(dir, "forecasts"));
  writeFileSync(join(dir, "forecasts", "round-1.json"), JSON.stringify(sealed({ "r1-a": flat(0.5) })));
  const opened = await post(ballot);
  assert.equal(opened.status, 200);
  assert.deepEqual(await opened.json(), { ok: true, duplicate: false });
});

test("a segment cell with 9 voters claims nothing and one with 10 does: small cells must not overclaim", () => {
  const results = build([...crowd("stu", "student", "r1-a", 9, 4), ...crowd("pro", "young_pro", "r1-a", 10, 4)], ["r1-a"], { "r1-a": flat(0.5) });
  const cell = (segment: Segment) => find(results.cells, (c) => c.segment === segment);
  assert.equal(cell("student").human.n, 9);
  assert.equal(cell("student").enough, false);
  assert.equal(cell("young_pro").human.n, 10);
  assert.equal(cell("young_pro").enough, true);
});

test("in a room of only students the pooled ai is the student forecast: the AI is graded against the room it actually faced", () => {
  const results = build(crowd("stu", "student", "r1-a", 12, 6), ["r1-a"], { "r1-a": { student: 0.8, young_pro: 0.1, parent: 0.2, fitness: 0.3 } });
  near(result(results, "r1-a").ai, 0.8, 1e-12);
});

test("aiPickedWinner is true only when the AI's top ad is the room's top ad among n >= 10: no credit or blame from thin data", () => {
  const ids = ["r1-a", "r1-b", "r1-c", "r1-d"];
  // r1-d is 3 out of 3 taps: the highest raw rate, but too few votes to be the human winner.
  const room = [
    ...crowd("stu", "student", "r1-a", 10, 8),
    ...crowd("stu", "student", "r1-b", 10, 5),
    ...crowd("stu", "student", "r1-c", 10, 2),
    ...crowd("stu", "student", "r1-d", 3, 3),
  ];

  const agree = scorecard(build(room, ids, { "r1-a": flat(0.9), "r1-b": flat(0.5), "r1-c": flat(0.1), "r1-d": flat(0.2) }));
  assert.deepEqual([agree.humanWinnerId, agree.aiWinnerId, agree.aiPickedWinner], ["r1-a", "r1-a", true]);

  const disagree = scorecard(build(room, ids, { "r1-a": flat(0.1), "r1-b": flat(0.5), "r1-c": flat(0.9), "r1-d": flat(0.2) }));
  assert.deepEqual([disagree.humanWinnerId, disagree.aiWinnerId, disagree.aiPickedWinner], ["r1-a", "r1-c", false]);

  const unsealed = scorecard(build(room, ids));
  assert.deepEqual([unsealed.aiWinnerId, unsealed.aiPickedWinner], [null, null]);

  const thin = scorecard(build(crowd("stu", "student", "r1-a", 9, 9), ["r1-a"], { "r1-a": flat(0.9) }));
  assert.deepEqual([thin.humanWinnerId, thin.aiPickedWinner], [null, null]);
});

test("MAE and Spearman ignore variants with n < 10: a thin variant must not swing the headline accuracy", () => {
  const room = [
    ...crowd("stu", "student", "r1-a", 10, 8),
    ...crowd("stu", "student", "r1-b", 10, 5),
    ...crowd("stu", "student", "r1-c", 10, 2),
    ...crowd("stu", "student", "r1-d", 9, 0),
  ];
  // r1-d's forecast is wildly off (0.99 vs 0/9), so counting it would wreck both numbers.
  const forecast = { "r1-a": flat(0.7), "r1-b": flat(0.5), "r1-c": flat(0.3), "r1-d": flat(0.99) };
  const card = scorecard(build(room, ["r1-a", "r1-b", "r1-c", "r1-d"], forecast));
  near(card.mae, (0.1 + 0 + 0.1) / 3, 1e-12);
  near(card.spearman, 1, 1e-12);

  const twoJudged = scorecard(build(room.filter((v) => v.variantId !== "r1-c"), ["r1-a", "r1-b", "r1-d"], forecast));
  near(twoJudged.mae, (0.1 + 0) / 2, 1e-12);
  assert.equal(twoJudged.spearman, null);
});

test("judges never change the pooled rate or the AI's weighting: finals votes must not move the room's result", () => {
  const ids = ["r1-a", "r1-b"];
  const forecast = { "r1-a": { student: 0.8, young_pro: 0.2, parent: 0.5, fitness: 0.5 }, "r1-b": flat(0.5) };
  const room = [...crowd("stu", "student", "r1-a", 10, 5), ...crowd("pro", "young_pro", "r1-a", 10, 2)];
  // Fresh judge phones, plus a lunch voter's phone reopened with ?seg=judge on an ad it had not rated.
  const judges = [...crowd("jdg", "judge", "r1-a", 10, 10), vote("stu-voter-0", "judge", "r1-b", true)];

  const before = build(room, ids, forecast);
  const after = build([...room, ...judges], ids, forecast);
  assert.deepEqual(result(after, "r1-a"), result(before, "r1-a"));
  assert.equal(result(after, "r1-b").human.n, 0);

  const judgeCell = find(after.cells, (c) => c.variantId === "r1-a" && c.segment === "judge");
  assert.deepEqual([judgeCell.human.n, judgeCell.ai, judgeCell.enough], [10, null, true]);
  assert.equal(find(after.cells, (c) => c.variantId === "r1-b" && c.segment === "judge").human.n, 1);
});

test("'other' voters get their own cell but never enter the graded rate: the AI never modelled them, so it is not graded on them", () => {
  const forecast = { "r1-a": flat(0.5) };
  const panelOnly = build(crowd("stu", "student", "r1-a", 10, 5), ["r1-a"], forecast);
  const withOther = build([...crowd("stu", "student", "r1-a", 10, 5), ...crowd("oth", "other", "r1-a", 10, 10)], ["r1-a"], forecast);
  assert.deepEqual(result(withOther, "r1-a"), result(panelOnly, "r1-a"));
  assert.deepEqual(scorecard(withOther), scorecard(panelOnly));
  assert.equal(withOther.voters, 20);
  const otherCell = find(withOther.cells, (c) => c.segment === "other");
  assert.deepEqual([otherCell.human.taps, otherCell.human.n, otherCell.ai], [10, 10, null]);
});

test("aiWinnerId is the sealed pick even when the room's mix moves the argmax: the AI's headline bet is what it registered", () => {
  const ids = ["r1-a", "r1-b"];
  // Equal weights favour r1-b (0.5 vs 0.6), which is what was sealed; a room of students favours r1-a (0.9).
  const forecast = { "r1-a": { student: 0.9, young_pro: 0.1, parent: 0.5, fitness: 0.5 }, "r1-b": flat(0.6) };
  const room = [...crowd("stu", "student", "r1-a", 10, 8), ...crowd("stu", "student", "r1-b", 10, 3)];
  const card = scorecard(build(room, ids, forecast, "r1-b"));
  assert.deepEqual([card.aiWinnerId, card.humanWinnerId, card.aiPickedWinner], ["r1-b", "r1-a", false]);
  // A forecast sealed without a pick falls back to the argmax of the post-stratified ai.
  assert.equal(scorecard(build(room, ids, forecast)).aiWinnerId, "r1-a");
});

test("votes cast before their round opens stay on disk but are not counted: phone tests must not pollute the experiment", () => {
  const opens = "2026-10-03T13:00:00.000Z";
  const phoneTests = [
    vote("phone-test-1", "student", "r1-a", true, "2026-10-03T12:41:00.000Z"),
    vote("phone-test-2", "parent", "r1-a", true, "2026-10-03T12:59:59.999Z"),
  ];
  const lunch = [...crowd("stu", "student", "r1-a", 10, 2), vote("on-the-dot", "student", "r1-a", false, opens)];
  const input = { votes: [...phoneTests, ...lunch], variantsByRound: { 1: [variant("r1-a")] }, forecastsByRound: { 1: sealed({ "r1-a": flat(0.5) }) }, activeRound: 1, now: NOW };

  const results = buildResults({ ...input, opensAt: { "1": opens } });
  assert.deepEqual([results.voters, results.votes], [11, 11]);
  assert.deepEqual(results.segmentMix, [{ segment: "student", voters: 11 }]);
  assert.deepEqual([result(results, "r1-a").human.taps, result(results, "r1-a").human.n], [2, 11]);
  assert.equal(buildResults(input).votes, 13);
  assert.throws(() => buildResults({ ...input, opensAt: { "1": "not a time" } }), /opensAt/);
});

test("the backend.md table reproduces fixtures/results.json's cells, AI values and verdicts: the dashboard built on fixtures sees the same maths live", () => {
  const fixtures = new URL("../../../../fixtures/", import.meta.url);
  const { variants } = VariantsResponse.parse(JSON.parse(readFileSync(new URL("variants.json", fixtures), "utf8")));
  const expected = ResultsResponse.parse(JSON.parse(readFileSync(new URL("results.json", fixtures), "utf8")));

  const segments = ["student", "young_pro", "parent", "fitness", "other"] as const;
  const voters = [14, 18, 6, 7, 2];
  // Taps by student/young_pro/parent/fitness/other, then AI P(tap) by student/young_pro/parent/fitness.
  const table: [string, number[], [number, number, number, number]][] = [
    ["r1-social_proof", [11, 12, 3, 4, 1], [0.6, 0.6, 0.4, 0.5]],
    ["r1-scarcity", [6, 6, 2, 2, 1], [0.5, 0.4, 0.3, 0.3]],
    ["r1-health_halo", [4, 8, 3, 6, 1], [0.6, 0.7, 0.8, 0.9]],
    ["r1-indulgence", [10, 10, 2, 3, 2], [0.6, 0.5, 0.4, 0.4]],
    ["r1-provenance", [5, 10, 5, 3, 1], [0.5, 0.6, 0.8, 0.6]],
    ["r1-value", [9, 7, 2, 1, 1], [0.6, 0.4, 0.5, 0.3]],
  ];
  const votes = table.flatMap(([id, taps]) => segments.flatMap((segment, s) => crowd(segment, segment, id, voters[s]!, taps[s]!)));
  const perSegment = Object.fromEntries(
    table.map(([id, , [student, young_pro, parent, fitness]]) => [id, { student, young_pro, parent, fitness }]),
  );
  const seal = find(expected.seals, (s) => s.round === 1);
  const forecast: ForecastFile = { ...seal, perSegment, answers: [] };

  const actual = buildResults({ votes, variantsByRound: { 1: variants }, forecastsByRound: { 1: forecast }, activeRound: 1, now: NOW });

  // The fixture was written with every number rounded to 3 decimals.
  function round3(x: unknown): unknown {
    if (typeof x === "number") return Math.round(x * 1000) / 1000;
    if (Array.isArray(x)) return x.map(round3);
    if (x !== null && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, round3(v)]));
    return x;
  }
  assert.equal(actual.voters, 47);
  assert.equal(actual.votes, 282);
  assert.deepEqual(actual.segmentMix, expected.segmentMix);
  // Graded rates use the 4 panel segments only (45 voters), so the fixture's 2 "other" voters drop out of them.
  assert.deepEqual(
    actual.variants.map((v) => [v.variantId, v.human.taps, v.human.n]),
    table.map(([id, taps]) => [id, taps.slice(0, 4).reduce((sum, t) => sum + t, 0), 45]),
  );
  assert.deepEqual(actual.variants.map((v) => [round3(v.ai), v.aiInsideCi]), expected.variants.map((v) => [v.ai, v.aiInsideCi]));
  assert.deepEqual(round3(actual.cells), expected.cells);
  assert.deepEqual(actual.seals, expected.seals);

  const card = scorecard(actual);
  assert.deepEqual([card.humanWinnerId, card.aiWinnerId, card.aiPickedWinner], ["r1-social_proof", "r1-health_halo", false]);
  near(card.mae, 0.096, 0.001);
  near(card.spearman, 0.486, 0.001);
});
