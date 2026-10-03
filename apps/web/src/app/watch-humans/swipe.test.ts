import assert from "node:assert/strict";
import { test } from "node:test";
import type { Ad, Campaign } from "@hack/contract";
import { finalists, humanLeader, record, swipeDirection, SWIPE_PX, type Tally } from "./swipe";

// These helpers read only an ad's id and status.
const ad = (id: string, status: Ad["status"] = "survivor") => ({ id, status }) as Ad;
const campaign = (...gens: Ad[][]) => ({ generations: gens.map((ads) => ({ ads })) }) as unknown as Campaign;

test("members judge only the last generation's survivors and winner: culled ads never cost a swipe", () => {
  const c = campaign([ad("g0-a"), ad("g0-b", "culled")], [ad("g1-a", "culled"), ad("g1-b"), ad("g1-c", "winner")]);
  assert.deepEqual(finalists(c).map((a) => a.id), ["g1-b", "g1-c"]);
  assert.deepEqual(finalists(campaign()), []);
});

test("a short drag is a tap on the card, not a vote", () => {
  assert.equal(swipeDirection(SWIPE_PX - 1), null);
  assert.equal(swipeDirection(1 - SWIPE_PX), null);
  assert.equal(swipeDirection(SWIPE_PX), "right");
  assert.equal(swipeDirection(-SWIPE_PX), "left");
});

test("record returns a new tally and leaves the old one untouched, as React state needs", () => {
  const before: Tally = {};
  const after = record(record(before, "x", true), "x", false);
  assert.deepEqual(before, {});
  assert.deepEqual(after, { x: { taps: 1, n: 2 } });
});

test("no members' pick before anyone swipes, and none on a tie: a coin flip is not a verdict", () => {
  const ads = [ad("a"), ad("b"), ad("c")];
  assert.equal(humanLeader(ads, {}), null);
  const oneMember = record(record(record({}, "a", true), "b", true), "c", false);
  assert.equal(humanLeader(ads, oneMember), null);
});

test("members can overrule the AI's winner", () => {
  const ads = [ad("ai-winner", "winner"), ad("people-pick")];
  let tally: Tally = {};
  for (let i = 0; i < 3; i++) tally = record(record(tally, "people-pick", true), "ai-winner", false);
  assert.equal(humanLeader(ads, tally)?.id, "people-pick");
});

test("one lucky tap does not outrank an ad most members tapped", () => {
  const ads = [ad("lucky"), ad("tested")];
  let tally = record({}, "lucky", true); // 1 of 1: posterior mean 2/3
  for (let i = 0; i < 10; i++) tally = record(tally, "tested", i < 9); // 9 of 10: 10/12
  assert.equal(humanLeader(ads, tally)?.id, "tested");
});
