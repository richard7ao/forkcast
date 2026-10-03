import assert from "node:assert/strict";
import { test } from "node:test";
import { VoteRequest } from "@hack/contract";
import {
  clampDwell, enqueue, flush, getVoterId, newVoterId, parseSegmentParam, readQueue, safeStorage, shuffleSeeded,
  QUEUE_KEY, VOTER_KEY, type StorageLike,
} from "./lite";

const ADS = ["r1-social_proof", "r1-scarcity", "r1-health_halo", "r1-indulgence", "r1-provenance", "r1-value"];

const mapStore = (initial: Record<string, string> = {}): StorageLike => {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

const vote = (variantId: string, over: Partial<VoteRequest> = {}): VoteRequest => ({
  voterId: "voter-0001", segment: "student", variantId, tapped: true, dwellMs: 1200, ...over,
});

const ids = (store: StorageLike) => readQueue(store).map((v) => v.variantId);

test("a refresh never re-deals the deck: the same voter and round always get the same order, so nobody double-votes", () => {
  assert.deepEqual(shuffleSeeded(ADS, "voter-0001" + 1), shuffleSeeded(ADS, "voter-0001" + 1));
});

test("every ad is shown exactly once and the input is untouched: no ad dropped, exposure stays balanced", () => {
  for (let n = 0; n < 50; n++) {
    const input = [...ADS];
    const out = shuffleSeeded(input, `voter-${n}` + 1);
    assert.deepEqual([...out].sort(), [...ADS].sort());
    assert.deepEqual(input, ADS);
    assert.notEqual(out, input);
  }
});

// The brief said ">= 10 distinct first cards", which 6 ads cannot give; this is the closest meaningful bound.
test("first-position bias is spread: 20 voters open on at least 5 of the 6 ads and see at least 10 different orders", () => {
  const orders = Array.from({ length: 20 }, (_, n) => shuffleSeeded(ADS, `voter-${n}` + 1));
  assert.ok(new Set(orders.map((o) => o[0])).size >= 5);
  assert.ok(new Set(orders.map((o) => o.join())).size >= 10);
});

test("?seg=judge is the only door to the judge segment, and a normal segment skips the picker too", () => {
  assert.equal(parseSegmentParam("?seg=judge"), "judge");
  assert.equal(parseSegmentParam("?seg=student"), "student");
});

test("an unknown ?seg= is ignored, so a typo shows the picker instead of sending a segment the API rejects", () => {
  assert.equal(parseSegmentParam("?seg=hacker"), null);
});

test("no ?seg= means the voter picks their own group", () => {
  assert.equal(parseSegmentParam(""), null);
  assert.equal(parseSegmentParam("?x=1"), null);
});

test("enqueueing the same card twice keeps one vote, so a retried tap is never queued twice", () => {
  const store = mapStore();
  enqueue(store, vote("a"));
  enqueue(store, vote("a", { tapped: false }));
  enqueue(store, vote("b"));
  assert.deepEqual(ids(store), ["a", "b"]);
});

test("a failed send stays queued, so a flaky connection delays a vote instead of losing it", async () => {
  const store = mapStore();
  enqueue(store, vote("a"));
  await flush(store, () => Promise.reject(new Error("offline")));
  assert.deepEqual(ids(store), ["a"]);
});

test("a sent vote leaves the queue, so it is never sent twice, while a failure beside it stays", async () => {
  const store = mapStore();
  enqueue(store, vote("a"));
  enqueue(store, vote("b"));
  await flush(store, (v) => (v.variantId === "a" ? Promise.resolve() : Promise.reject(new Error("offline"))));
  assert.deepEqual(ids(store), ["b"]);
});

test("a vote queued while a flush is in flight survives it, so a late failure is not erased", async () => {
  const store = mapStore();
  enqueue(store, vote("a"));
  await flush(store, async () => enqueue(store, vote("late")));
  assert.deepEqual(ids(store), ["late"]);
});

test("a corrupt or out-of-contract queue reads as empty, so bad stored data cannot crash the page", () => {
  assert.deepEqual(readQueue(mapStore({ [QUEUE_KEY]: "{not json" })), []);
  assert.deepEqual(readQueue(mapStore({ [QUEUE_KEY]: JSON.stringify([{ voterId: "x" }, vote("ok")]) })).length, 1);
});

test("a tab left open for hours still yields a dwell the contract accepts, so the vote is not rejected and retried forever", () => {
  for (const ms of [-5, 0, 1234.6, 3 * 3_600_000]) {
    assert.ok(VoteRequest.safeParse(vote("a", { dwellMs: clampDwell(ms) })).success, `dwell ${ms}`);
  }
});

test("a voter id exists even where crypto.randomUUID is blocked (plain-http LAN URL)", () => {
  const insecure = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
  const id = newVoterId(insecure);
  assert.ok(VoteRequest.shape.voterId.safeParse(id).success);
  assert.notEqual(id, newVoterId(insecure));
});

test("a refresh keeps the voter, and so the deck: the stored id is reused and a garbage one is replaced", () => {
  const store = mapStore();
  assert.equal(getVoterId(store), getVoterId(store));
  const bad = mapStore({ [VOTER_KEY]: "x" });
  const id = getVoterId(bad);
  assert.notEqual(id, "x");
  assert.equal(bad.getItem(VOTER_KEY), id);
});

test("blocked localStorage must not stop voting: storage falls back to memory instead of throwing", () => {
  const blocked: StorageLike = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  const store = safeStorage(blocked);
  enqueue(store, vote("a"));
  assert.deepEqual(ids(store), ["a"]);
});
