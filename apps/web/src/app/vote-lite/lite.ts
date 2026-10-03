/**
 * Pure helpers for /vote-lite, the insurance voting page. No React and no
 * `window` access at import time, so node:test can exercise every rule that
 * protects the vote data without a browser.
 */
import { Segment, VoteRequest } from "@hack/contract";

/** The slice of Storage the page uses. Tests inject a Map-backed one. */
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const VOTER_KEY = "fk-voter";
export const QUEUE_KEY = "fk-queue";
export const doneKey = (round: number) => `fk-done-r${round}`;

/** FNV-1a: any string to a uint32 seed. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over a seeded PRNG. Returns a new array; `items` is untouched. */
export function shuffleSeeded<T>(items: readonly T[], seed: string): T[] {
  const rand = mulberry32(hashString(seed));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** `?seg=<segment>` from location.search. "judge" is only reachable this way. */
export function parseSegmentParam(search: string): Segment | null {
  const parsed = Segment.safeParse(new URLSearchParams(search).get("seg"));
  return parsed.success ? parsed.data : null;
}

/** Whole ms inside VoteRequest.dwellMs (0..600000): a tab left open must not produce a vote the API rejects. */
export const clampDwell = (ms: number) => Math.min(600_000, Math.max(0, Math.round(ms)));

/** crypto.randomUUID is secure-context only; a phone on a plain-http LAN URL needs the getRandomValues fallback. */
export function newVoterId(
  c: Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">> = globalThis.crypto,
): string {
  if (c.randomUUID) return c.randomUUID();
  return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The stored id when it is still a valid voterId, else a fresh one (stored, so a refresh keeps the voter and the deck). */
export function getVoterId(store: StorageLike): string {
  const stored = VoteRequest.shape.voterId.safeParse(store.getItem(VOTER_KEY));
  if (stored.success) return stored.data;
  const id = newVoterId();
  store.setItem(VOTER_KEY, id);
  return id;
}

/** Writes also land in memory and no call throws, so blocked or full localStorage (private mode) degrades instead of crashing the voter. */
export function safeStorage(raw: StorageLike | null): StorageLike {
  const mem = new Map<string, string>();
  return {
    getItem: (k) => {
      try {
        return raw?.getItem(k) ?? mem.get(k) ?? null;
      } catch {
        return mem.get(k) ?? null;
      }
    },
    setItem: (k, v) => {
      mem.set(k, v);
      try {
        raw?.setItem(k, v);
      } catch {
        // the memory copy still serves this session
      }
    },
  };
}

export function browserStorage(): StorageLike {
  let raw: Storage | null = null;
  try {
    raw = window.localStorage; // throws on the server and when site data is blocked
  } catch {
    // fall through to memory-only
  }
  return safeStorage(raw);
}

const voteKey = (v: VoteRequest) => `${v.voterId}|${v.variantId}`;

/** Entries that are corrupt or no longer match the contract are dropped: the API could never accept them. */
export function readQueue(store: StorageLike): VoteRequest[] {
  let raw: unknown;
  try {
    raw = JSON.parse(store.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = VoteRequest.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

const writeQueue = (store: StorageLike, queue: VoteRequest[]) => store.setItem(QUEUE_KEY, JSON.stringify(queue));

/** Dedupes on voterId|variantId, the same key the API treats as one vote. */
export function enqueue(store: StorageLike, vote: VoteRequest): void {
  const queue = readQueue(store);
  if (queue.some((v) => voteKey(v) === voteKey(vote))) return;
  writeQueue(store, [...queue, vote]);
}

/**
 * Sends every queued vote in order. Sent votes are removed, failures stay for
 * the next flush. The queue is re-read after the sends so a vote queued while
 * a send was in flight is not erased by this flush.
 */
export async function flush(store: StorageLike, send: (vote: VoteRequest) => Promise<unknown>): Promise<void> {
  const sent = new Set<string>();
  for (const vote of readQueue(store)) {
    try {
      await send(vote);
      sent.add(voteKey(vote));
    } catch {
      // stays queued
    }
  }
  if (sent.size > 0) writeQueue(store, readQueue(store).filter((v) => !sent.has(voteKey(v))));
}
