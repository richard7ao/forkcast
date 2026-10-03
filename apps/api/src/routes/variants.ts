import { Hono } from "hono";
import type { ResponseOf } from "@hack/contract";
import { store } from "../data/store";

/** The active round only: round 1 until the challenger runs, then round 2. */
export const variantsRoutes = new Hono().get("/variants", (c) => {
  const round = store.activeRound();
  const variants = store.variants(round);
  if (!variants) throw new Error(`active round ${round} has no variants file`);
  const body: ResponseOf<"variants"> = { round, product: store.product(round), variants };
  return c.json(body);
});
