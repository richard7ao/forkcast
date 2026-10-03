import { ResultsResponse, VariantsResponse, VoteResponse } from "@hack/contract";

/**
 * End-to-end check of the vote pipeline against a running API whose active round is sealed.
 * It stores one real vote, so point it at a scratch DATA_DIR, never the live event server.
 */
const BASE_URL = process.env.BASE_URL ?? "http://localhost:8799";
let failures = 0;

function check(name: string, ok: boolean, detail: unknown) {
  console.log(ok ? `✓ ${name}` : `✗ ${name}: ${JSON.stringify(detail)}`);
  if (!ok) failures++;
}

async function call(path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  const init = body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const res = await fetch(`${BASE_URL}${path}`, init);
  return { status: res.status, json: await res.json().catch(() => null) };
}

const isDuplicate = (r: { status: number; json: unknown }, expected: boolean) =>
  r.status === 200 && VoteResponse.safeParse(r.json).data?.duplicate === expected;

try {
  const before = ResultsResponse.parse((await call("/results")).json);
  const sealed = before.seals.some((s) => s.round === before.activeRound);
  check(`active round ${before.activeRound} is sealed (votes are refused until it is)`, sealed, before.seals);
  const target = VariantsResponse.parse((await call("/variants")).json).variants[0];
  if (!target) throw new Error("GET /variants returned no variants");

  const vote = { voterId: `smoke-${crypto.randomUUID()}`, segment: "other", variantId: target.id, tapped: true, dwellMs: 1200 };
  const first = await call("/votes", vote);
  check("first vote is stored (200, duplicate: false)", isDuplicate(first, false), first);
  const repeat = await call("/votes", { ...vote, tapped: false });
  check("same (voterId, variantId) again is a duplicate (200, duplicate: true)", isDuplicate(repeat, true), repeat);
  const invalid = await call("/votes", { ...vote, voterId: "short" });
  check("invalid body is rejected with 400", invalid.status === 400, invalid);
  const unknown = await call("/votes", { ...vote, variantId: "no-such-variant" });
  check("variant outside the active round is rejected with 400", unknown.status === 400, unknown);

  const after = ResultsResponse.parse((await call("/results")).json);
  check("results count exactly one more vote", after.votes === before.votes + 1, { before: before.votes, after: after.votes });
} catch (err) {
  check("smoke run completed", false, err instanceof Error ? err.message : String(err));
}

process.exit(failures > 0 ? 1 : 0);
