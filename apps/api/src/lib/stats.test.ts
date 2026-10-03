import assert from "node:assert/strict";
import { test } from "node:test";
import type { Rate } from "@hack/contract";
import { mae, postStratify, spearman, wilson } from "./stats";

function near(actual: number | null, expected: number, tolerance: number) {
  assert.ok(actual !== null && Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
}

const width = ({ lo, hi }: Rate) => {
  assert.ok(lo !== null && hi !== null);
  return hi - lo;
};

test("wilson(30, 60) is about [0.396, 0.604]: the intervals are what stop us overclaiming on stage", () => {
  const r = wilson(30, 60);
  assert.equal(r.rate, 0.5);
  near(r.lo, 0.396, 0.005);
  near(r.hi, 0.604, 0.005);
});

test("wilson(3, 6) is wider than wilson(30, 60): six votes must claim less than sixty at the same rate", () => {
  assert.ok(width(wilson(3, 6)) > width(wilson(30, 60)));
});

test("wilson(0, 10) and wilson(10, 10) stay inside [0, 1]: a unanimous room still gets a valid interval", () => {
  for (const r of [wilson(0, 10), wilson(10, 10)]) {
    assert.ok(r.lo !== null && r.hi !== null);
    assert.ok(r.lo >= 0 && r.hi <= 1 && r.lo < r.hi, JSON.stringify(r));
  }
  assert.equal(wilson(0, 10).lo, 0);
  assert.equal(wilson(10, 10).hi, 1);
});

test("wilson(0, 0) is all nulls: no votes means no rate, not a 0% rate", () => {
  assert.deepEqual(wilson(0, 0), { taps: 0, n: 0, rate: null, lo: null, hi: null });
});

test("spearman is 1 for identical ranks and -1 for reversed ranks: the rank-agreement score is anchored", () => {
  near(spearman([0.1, 0.5, 0.3, 0.9], [0.2, 0.6, 0.4, 0.8]), 1, 1e-12);
  near(spearman([0.1, 0.5, 0.3, 0.9], [0.8, 0.4, 0.6, 0.2]), -1, 1e-12);
});

test("spearman gives tied values their average rank: a tie must not invent an ordering", () => {
  // xs ranks [1, 2.5, 2.5, 4] against [1, 2, 3, 4]: rho = 4.5 / sqrt(4.5 * 5)
  near(spearman([1, 2, 2, 3], [1, 2, 3, 4]), 4.5 / Math.sqrt(4.5 * 5), 1e-12);
});

test("spearman is null below 3 points or with no variance: no agreement is claimed from too little data", () => {
  assert.equal(spearman([0.1, 0.9], [0.2, 0.8]), null);
  assert.equal(spearman([0.5, 0.5, 0.5], [0.1, 0.2, 0.3]), null);
});

test("mae is the mean absolute gap on the 0-1 scale, and null with nothing to score", () => {
  near(mae([[0.5, 0.6], [0.3, 0.1]]), 0.15, 1e-12);
  assert.equal(mae([]), null);
});

test("postStratify weights the panel by the room's segment counts, and equally before anyone votes", () => {
  const ai = { student: 0.8, young_pro: 0.2, parent: 0.4, fitness: 0.6 };
  near(postStratify(ai, { student: 3, young_pro: 1 }), (3 * 0.8 + 0.2) / 4, 1e-12);
  near(postStratify(ai, {}), 0.5, 1e-12);
});
