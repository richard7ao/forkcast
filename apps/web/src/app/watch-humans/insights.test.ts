import assert from "node:assert/strict";
import { test } from "node:test";
import type { Ad, Campaign } from "@hack/contract";
import { AGES, apportion, buildAnalytics, DAYS, GENDERS, HOURS } from "./insights";

const ad = (id: string, status: Ad["status"]) => ({ id, status, headline: `Headline ${id}` }) as Ad;
const campaign = (id: string) =>
  ({
    id,
    winnerId: "g1-c",
    product: { imageUrl: "/product.jpg" },
    generations: [{ ads: [ad("g0-a", "survivor")] }, { ads: [ad("g1-a", "culled"), ad("g1-b", "survivor"), ad("g1-c", "winner")] }],
  }) as unknown as Campaign;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test("a reload shows the same numbers: the panel is seeded from the campaign id", () => {
  assert.deepEqual(buildAnalytics(campaign("demo-epic")), buildAnalytics(campaign("demo-epic")));
  assert.notDeepEqual(buildAnalytics(campaign("demo-epic")).age, buildAnalytics(campaign("other")).age);
});

test("every breakdown adds up: counts sum to the members and shares to 100%", () => {
  for (const id of ["demo-epic", "a", "b", "c"]) {
    const a = buildAnalytics(campaign(id));
    assert.ok(a.members >= 1100 && a.members < 1300, `about 1,200 members, got ${a.members}`);
    for (const shares of [a.age, a.gender, a.region, a.household, a.diet, a.shopping, a.store, a.device]) {
      assert.equal(sum(shares.map((s) => s.count)), a.members);
      assert.equal(sum(shares.map((s) => s.pct)), 100);
    }
  }
});

test("swipe totals agree: members × finalists, the heat map and the per-finalist rights", () => {
  const a = buildAnalytics(campaign("demo-epic"));
  assert.deepEqual(a.finalists.map((f) => f.id), ["g1-b", "g1-c"], "only the last generation's survivors and winner");
  assert.equal(a.swipes, a.members * 2);
  assert.equal(a.when.length, DAYS.length);
  assert.ok(a.when.every((row) => row.length === HOURS));
  assert.equal(sum(a.when.flat()), a.swipes);
  assert.equal(a.rights, sum(a.finalists.map((f) => f.rights)));
  assert.ok(a.videos <= a.samples && a.samples <= a.members, "videos come from claimed samples");
  assert.ok(a.byAge.every((row) => row.length === AGES.length && row.every((r) => r >= 0 && r <= 1)));
  assert.ok(a.byGender.every((row) => row.length === GENDERS.length));
  assert.ok(a.insights.length >= 3);
});

test("no finalists yet: nothing to swipe, no insights, no division by zero", () => {
  const empty = { ...campaign("x"), generations: [] } as unknown as Campaign;
  const a = buildAnalytics(empty);
  assert.equal(a.swipes, 0);
  assert.deepEqual(a.insights, []);
});

test("largest-remainder rounding hits the total exactly", () => {
  assert.deepEqual(apportion(100, [1, 1, 1]), [34, 33, 33]);
  assert.equal(sum(apportion(100, [3, 7, 11, 13])), 100);
  assert.deepEqual(apportion(100, [0, 0]), [0, 0]);
});
