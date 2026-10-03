import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ResultsResponse, Variant, VariantsResponse } from "@hack/contract";
import {
  adminTokenConfigured,
  buildEvidence,
  buildRound2,
  challengerPrompt,
  challengerViolations,
  generateChallengers,
  type Challenger,
} from "./challenger";

// The fixtures tell the round-1 story: 47 voters, humans pick social proof, the AI overrates health halo.
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`../../../../fixtures/${name}`, import.meta.url), "utf8"));
const results = ResultsResponse.parse(fixture("results.json"));
const { product, variants: round1 } = VariantsResponse.parse(fixture("variants.json"));
const evidence = buildEvidence(results, round1);
const winner = round1[0]!;

const clean: Challenger = {
  headline: "The bag the whole office reaches for",
  body: "Baked, not fried, from red lentils, in a proper 85g bag. Pass it round the desk.",
  cta: "Shop now",
  rationale: "Option (a): aims social proof at young_pro, the winner's weakest segment (67% tap, n 18).",
};
const other: Challenger = { ...clean, headline: "Pass it round the desk" };

test("a missing, short or placeholder ADMIN_TOKEN locks the challenger, because a placeholder was briefly public in .env.example", () => {
  for (const weak of [undefined, "", "change-me", "x".repeat(15)]) assert.equal(adminTokenConfigured(weak), false, `accepted ${weak}`);
  assert.equal(adminTokenConfigured("x".repeat(16)), true);
});

test("evidence drops segment cells under n = 10, so a challenger never chases noise", () => {
  // Only student (14 voters) and young_pro (18) clear the bar; parent (6), fitness (7) and other (2) do not.
  assert.equal(evidence.segmentCells.length, 12);
  assert.deepEqual(new Set(evidence.segmentCells.map((c) => c.segment)), new Set(["student", "young_pro"]));
});

test("evidence names the round-1 human winner, and agrees with the dashboard's scorecard on who it is", () => {
  assert.equal(evidence.winner?.id, "r1-social_proof");
  assert.equal(evidence.winner?.id, results.scorecards[0]?.humanWinnerId);
  assert.deepEqual(
    evidence.ranking.map((r) => r.variantId),
    ["r1-social_proof", "r1-indulgence", "r1-provenance", "r1-health_halo", "r1-value", "r1-scarcity"],
  );
});

test("evidence lists where the sealed AI forecast missed the room", () => {
  assert.deepEqual(evidence.aiMisses.map((r) => r.variantId), ["r1-health_halo"]);
});

test("no variant at n >= 10 means no winner: round 2 is never built on thin evidence", () => {
  const thin = { ...results, variants: results.variants.map((v) => ({ ...v, human: { ...v.human, n: 9 } })) };
  const none = buildEvidence(thin, round1);
  assert.equal(none.winner, null);
  assert.deepEqual(none.ranking, []);
  assert.throws(() => challengerPrompt(none, product), /no round-1 human winner/);
});

test("the prompt shows only the winner's segments with n >= 10, weakest first, so a challenger neither chases noise nor borrows another lever's crowd", () => {
  const { user } = challengerPrompt(evidence, product);
  const segments = [...user.matchAll(/^- (student|young_pro|parent|fitness|other|judge): (\d+)% tap/gm)].map((m) => `${m[1]} ${m[2]}%`);
  assert.deepEqual(segments, ["young_pro 67%", "student 79%"]);
  assert.match(user, /r1-health_halo \(health_halo\): AI 71% vs people 47% tap/);
  for (const fact of product.facts) assert.ok(user.includes(fact), `missing fact: ${fact}`);
});

test("the incumbent keeps the winner's picture but challengers get none yet, because their own images are made later", () => {
  const pictured = buildRound2({ ...winner, imageUrl: "/generated/r1-social_proof.png" }, [clean, other]);
  assert.deepEqual(pictured.map((v) => v.imageUrl), ["/generated/r1-social_proof.png", undefined, undefined]);
});

test("every round-2 arm carries the winner's lever and descends from it, so round 2 tests execution, not a new lever", () => {
  // Even a lever smuggled in by the model cannot change an arm's lever.
  const round2 = buildRound2(winner, [clean, { ...other, lever: "indulgence" } as Challenger]);
  assert.deepEqual(
    round2.map((v) => [v.id, v.round, v.lever, v.parentId]),
    [
      ["r2-incumbent", 2, winner.lever, winner.id],
      ["r2-c1", 2, winner.lever, winner.id],
      ["r2-c2", 2, winner.lever, winner.id],
    ],
  );
  const copy = ({ headline, body, cta }: Variant) => ({ headline, body, cta });
  assert.deepEqual(copy(round2[0]!), copy(winner));
  assert.equal(round2[0]!.rationale, "Round-1 human winner, re-tested unchanged as the control");
  for (const v of round2) Variant.parse(v);
});

test("challenger copy with a number no fact backs is rejected: no invented stats in front of real people", () => {
  assert.deepEqual(challengerViolations([clean, other], product, winner), []);
  assert.deepEqual(challengerViolations([{ ...clean, headline: "Loved by 10,000 Londoners" }], product, winner), [
    "c1: numbers not in the facts: 10,000",
    "c1: banned words: Loved by",
  ]);
  // Round-1 results belong in the rationale, never in the ad itself.
  assert.deepEqual(challengerViolations([clean, { ...other, body: "66% of the room tapped this" }], product, winner), ["c2: numbers not in the facts: 66"]);
});

test("round 2 is held to round 1's banned claims, so a challenger cannot win on a fake award with no digits in it", () => {
  assert.deepEqual(challengerViolations([{ ...clean, body: "The award-winning office crisp." }], product, winner), ["c1: banned words: award-winning"]);
});

test("a challenger that repeats the winner's or the other challenger's headline is rejected, so voters never see the same ad twice", () => {
  const repeat = "c1: headline repeats the winner's or the other challenger's; make it distinct";
  assert.deepEqual(challengerViolations([{ ...clean, headline: ` ${winner.headline.toUpperCase()} ` }, other], product, winner), [repeat]);
  assert.deepEqual(challengerViolations([clean, clean], product, winner), [repeat.replace("c1", "c2")]);
});

test("over-long copy is rejected, because the ad card has fixed limits", () => {
  const [problem] = challengerViolations([{ ...clean, headline: "x".repeat(61) }], product, winner);
  assert.match(problem ?? "", /^c1 headline: .*60/);
});

test("the generator re-asks with the exact violations listed, then ships only clean copy", async () => {
  const replies: Challenger[][] = [[{ ...clean, headline: "Loved by 10,000 Londoners" }, other], [clean, other]];
  const asked: string[] = [];
  const out = await generateChallengers(evidence, product, async (_system, user) => {
    asked.push(user);
    return replies[asked.length - 1]!;
  });
  assert.deepEqual(out, [clean, other]);
  assert.equal(asked.length, 2);
  assert.match(asked[1]!, /c1: numbers not in the facts: 10,000/);
});

test("copy that still breaks the rules after 3 attempts fails loud instead of reaching voters", async () => {
  let calls = 0;
  const stubborn = async () => {
    calls++;
    return [{ ...clean, cta: "Join 5,000 fans" }, other];
  };
  await assert.rejects(generateChallengers(evidence, product, stubborn), /5,000/);
  assert.equal(calls, 3);
});
