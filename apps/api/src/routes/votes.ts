import { Hono } from "hono";
import { VoteRequest, type ResponseOf } from "@hack/contract";
import { store as defaultStore, type Store } from "../data/store";

const rejected = (error: string): ResponseOf<"vote"> => ({ ok: false, duplicate: false, error });

/** Idempotent on (voterId, variantId): a repeat answers 200 with duplicate: true and is not stored. Takes the store so tests can use a temp dir. */
export function votesRoutesFor(store: Store) {
  return new Hono().post("/votes", async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json(rejected("body is not valid JSON"), 400);
    }
    const parsed = VoteRequest.safeParse(raw);
    if (!parsed.success) {
      return c.json(rejected(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")), 400);
    }
    const round = store.activeRound();
    // Pre-registration: no vote may exist before its round's forecast is sealed.
    if (!store.forecast(round)) return c.json(rejected("round not open"), 400);
    if (!store.variants(round)?.some((v) => v.id === parsed.data.variantId)) {
      return c.json(rejected(`variant ${parsed.data.variantId} is not in active round ${round}`), 400);
    }
    const body: ResponseOf<"vote"> = { ok: true, duplicate: store.addVote(parsed.data).duplicate };
    return c.json(body);
  });
}

export const votesRoutes = votesRoutesFor(defaultStore);
