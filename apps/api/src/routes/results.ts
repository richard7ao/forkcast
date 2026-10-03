import { Hono } from "hono";
import type { ResponseOf } from "@hack/contract";
import { store } from "../data/store";
import { buildResults } from "../lib/results";

/** Cheap enough to poll every 3 s: a few tiny JSON reads plus an in-memory pass over the votes. */
export const resultsRoutes = new Hono().get("/results", (c) => {
  const { activeRound, opensAt } = store.state();
  const rounds = Array.from({ length: activeRound }, (_, i) => i + 1);
  const body: ResponseOf<"results"> = buildResults({
    votes: store.votes(),
    variantsByRound: Object.fromEntries(rounds.map((r) => [r, store.variants(r)])),
    forecastsByRound: Object.fromEntries(rounds.map((r) => [r, store.forecast(r)])),
    opensAt,
    activeRound,
    now: new Date(),
  });
  return c.json(body);
});
