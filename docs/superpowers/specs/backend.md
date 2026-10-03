# Forkcast Backend — Spec

> **Who this is for:** the backend person on the two-person EAT_HACK team (and their Claude Code).
> The frontend person works from `docs/superpowers/specs/frontend.md`. The two files share one
> frozen contract (section "Shared contract"), which is copied verbatim into both files.
> If you change the contract, change both files and tell the other person. After 13:05 you may
> only ADD optional fields.

## What we are building (60-second version)

**Forkcast** pre-tests food ads with a sealed AI forecast and real people.

1. Pick one real product from The Shelf. An LLM writes **6 ad variants**, one per behavioural
   lever: social proof, scarcity, health halo, indulgence, provenance, value. All 6 use the same
   product photo; only the copy changes, so a win can be credited to the lever.
2. An **AI persona panel** (4 segments × 10 personas) predicts which ads each segment would tap.
   We **seal** the forecast: SHA-256 hash + timestamp, then commit and push it to the public
   repo **before any human votes**. Git history is the public proof of pre-registration.
3. At the **14:00 lunch**, attendees scan a QR code. Each picks a segment and sees all 6 ads in
   random order, answering "Would tap" or "Scroll past" for each.
4. The dashboard scores the sealed AI forecast against the room. It shows the pooled ranking
   with 90% Wilson intervals, segment cells only when n ≥ 10, and an evidence card per ad.
5. **Challenger loop:** lunch results go to the LLM, which writes challenger ads. A second
   forecast is sealed, and the 16:00 round tests the challengers against the lunch winner.
   Judges vote live at the 18:30 finals (`/vote?seg=judge`).

Pitch: *generation is free, validation is scarce.* The outcome is **stated tap intent**,
never CTR, ROAS or sales. Every synthetic number is labelled "AI forecast".

## Your role

You own the API, the data, the stats, the AI scripts, and the **live server laptop**
(API + web + tunnel run on your machine from 13:45).

| You own | Frontend owns | Nobody edits during the sprint |
|---|---|---|
| `packages/contract/**` (after freeze: additive only), `apps/api/**`, `fixtures/**`, `data/**`, `README.md` | `apps/web/src/app/**` pages, `apps/web/src/components/**`, `apps/web/src/lib/*.ts` helpers they add, `apps/web/public/**` | `apps/web/src/lib/client.ts`, `apps/web/src/lib/useEndpoint.ts`, `apps/web/src/app/api/[...path]/route.ts`, `packages/contract/src/fixtures.ts` |

## Timeline (BST, today, 3 Oct 2026)

| Time | You | Frontend |
|---|---|---|
| 12:45–13:05 | **T1.1.1 joint:** scaffold, contract, fixtures, push | Picks the Shelf product, photographs it, writes the pack facts, pairs on the contract |
| 13:05–13:35 | T1.2.1 vote pipeline (store, stats, routes) | `/vote` + `/qr` against fixtures |
| 13:35–13:55 | T1.2.2 generate → forecast → **seal + push** → go live → tunnel → test with 2 phones | Pushes `/vote`; tests on phones with you |
| 14:00–14:45 | Keep the server up. No pulls unless frontend says the build is green. Snapshot `data/votes.jsonl` at 14:45 | **Works the room** with `/qr` on a laptop |
| 14:45–15:15 | T1.3.1 challenger endpoint | `/dashboard` |
| **15:15** | **CUT CHECK:** is the dashboard live on real data? No → skip the challenger, polish, go to T1.3.2 | Same |
| 15:15–16:00 | Run challenger, seal round 2, push | Challenger panel + evidence card |
| 16:00–16:20 | Server up for round 2 | Works the room again |
| 16:20–16:45 | T1.3.2 evidence pack: README, data snapshot, adversarial review | Freeze UI |
| 16:45–17:15 | Help record the ≤2-min video | Records the video |
| 17:15–17:25 | Submit the form: public repo URL, video URL, Track 1 "Human Truth", Best Brand vote | — |
| 18:30 | Finals: server + tunnel up; judges vote with `?seg=judge` | Presents |

## Environment gotchas (read once)

- **Agent shells on Richard's Mac:** `node`/`pnpm` are broken shell functions. Prefix commands
  with `unset -f node npm npx pnpm 2>/dev/null; . ~/.nvm/nvm.sh`. That gives Node v22.13.1;
  corepack supplies the template's pinned pnpm 9.12.0.
- **Env loading:** neither `tsx` nor Next reads the root `.env` automatically. Before any
  command that needs keys: `set -a; . ./.env; set +a`.
- **Phones need a public URL:** run `cloudflared tunnel --url http://localhost:3300` (installed,
  2026.8.2). It prints `https://<random>.trycloudflare.com`, so the QR points at
  `<that>/vote`. Use `next build && next start`, not dev mode, for the live server: it is faster
  on phones and avoids dev-only cross-origin warnings.
- **AI provider: OpenAI** (`OPENAI_API_KEY` is the only key in `.env`). All calls go through
  `apps/api/src/lib/llm.ts` (plain `fetch`, no SDK, so the lockfile never changes). Defaults,
  overridable by env: copy, challenger and pack-fact extraction use `OPENAI_MODEL_COPY=gpt-6.1-sol`;
  the persona panel uses `OPENAI_MODEL_PANEL=gpt-5.4-mini`; the ad visual uses
  `OPENAI_MODEL_IMAGE=gpt-image-2`. Log `usage` tokens per run and put the real totals in the
  README. Do not quote prices from memory.
- **Protocol:** your global CLAUDE.md protocol applies. Init `tasks/backend-state.json` from
  this spec (local only; add `tasks/` to `.git/info/exclude`). Stages here are deliberately coarse.
- **Tests:** no new test framework. Use Node's runner: `node --import tsx --test <files>`.

## Shared contract (identical in backend.md and frontend.md)

`packages/contract/src/schemas.ts` (replaces the template's Item/Metric schemas):

```ts
import { z } from "zod";

export const Lever = z.enum(["social_proof", "scarcity", "health_halo", "indulgence", "provenance", "value"]);
export type Lever = z.infer<typeof Lever>;

/** Voter self-tag. "judge" is only reachable via /vote?seg=judge. The AI panel forecasts PANEL_SEGMENTS only. */
export const Segment = z.enum(["student", "young_pro", "parent", "fitness", "other", "judge"]);
export type Segment = z.infer<typeof Segment>;
export const PANEL_SEGMENTS = ["student", "young_pro", "parent", "fitness"] as const;

export const Product = z.object({
  brand: z.string(),
  name: z.string(),
  price: z.string(),           // display string, e.g. "£1.80"
  imageUrl: z.string(),        // served from apps/web/public, e.g. "/product.jpg"
  facts: z.array(z.string()),  // TRUE claims read off the pack; ad copy may only use these
});
export type Product = z.infer<typeof Product>;

export const Variant = z.object({
  id: z.string(),              // "r1-social_proof", "r2-incumbent", "r2-c1"
  round: z.number().int().min(1),
  lever: Lever,
  headline: z.string().max(60),
  body: z.string().max(160),
  cta: z.string().max(20),
  rationale: z.string(),       // how the copy expresses the lever; challengers cite the round-1 evidence they use
  parentId: z.string().nullable(), // round 2: the round-1 variant this one descends from; round 1: null
});
export type Variant = z.infer<typeof Variant>;

export const VariantsResponse = z.object({ round: z.number().int(), product: Product, variants: z.array(Variant) });

export const VoteRequest = z.object({
  voterId: z.string().min(8).max(64), // random UUID in localStorage; no PII
  segment: Segment,
  variantId: z.string(),
  tapped: z.boolean(),                // true = "Would tap", false = "Scroll past"
  dwellMs: z.number().int().min(0).max(600_000),
});
export type VoteRequest = z.infer<typeof VoteRequest>;
export const VoteResponse = z.object({ ok: z.boolean(), duplicate: z.boolean(), error: z.string().optional() });

/** Human tap rate with a 90% Wilson interval (z = 1.645). rate/lo/hi are null when n = 0. */
export const Rate = z.object({
  taps: z.number().int(),
  n: z.number().int(),
  rate: z.number().nullable(),
  lo: z.number().nullable(),
  hi: z.number().nullable(),
});
export type Rate = z.infer<typeof Rate>;

export const VariantResult = z.object({
  variantId: z.string(),
  round: z.number().int(),
  lever: Lever,
  human: Rate,
  ai: z.number().nullable(),          // sealed forecast P(tap), post-stratified to the room's panel-segment mix
  aiInsideCi: z.boolean().nullable(), // ai within [lo, hi]; null when human.n < 10 or ai is null
});
export type VariantResult = z.infer<typeof VariantResult>;

export const Cell = z.object({
  variantId: z.string(),
  segment: Segment,
  human: Rate,
  ai: z.number().nullable(),          // null for "other" and "judge" (not in the panel)
  enough: z.boolean(),                // human.n >= 10; UI shows "insufficient evidence" when false
});
export type Cell = z.infer<typeof Cell>;

export const Seal = z.object({
  round: z.number().int(),
  sealedAt: z.string(),               // ISO 8601 UTC
  sha256: z.string(),                 // hash of the canonical forecast JSON
  model: z.string(),
  personasPerSegment: z.number().int(),
});
export type Seal = z.infer<typeof Seal>;

export const Scorecard = z.object({
  round: z.number().int(),
  humanWinnerId: z.string().nullable(),
  aiWinnerId: z.string().nullable(),
  aiPickedWinner: z.boolean().nullable(),
  mae: z.number().nullable(),         // mean |ai - human.rate| over variants with human.n >= 10 (0-1 scale)
  spearman: z.number().nullable(),    // rank agreement across the round's variants; null if < 3 variants have n >= 10
});
export type Scorecard = z.infer<typeof Scorecard>;

export const ResultsResponse = z.object({
  updatedAt: z.string(),
  activeRound: z.number().int(),
  voters: z.number().int(),
  votes: z.number().int(),
  segmentMix: z.array(z.object({ segment: Segment, voters: z.number().int() })),
  variants: z.array(VariantResult),
  cells: z.array(Cell),
  seals: z.array(Seal),
  scorecards: z.array(Scorecard),
});
export type ResultsResponse = z.infer<typeof ResultsResponse>;

export const ChallengerRequest = z.object({ adminToken: z.string() });
export const ChallengerResponse = z.object({
  ok: z.boolean(),
  round: z.number().int().optional(),
  variants: z.array(Variant).optional(),
  error: z.string().optional(),
});
```

`packages/contract/src/endpoints.ts`: keep the template's `buildPath`, `EndpointName` and `ResponseOf`. Replace the registry with:

```ts
export const endpoints = {
  variants:   { method: "GET",  path: "/variants",   response: VariantsResponse,   fixture: "variants" },
  vote:       { method: "POST", path: "/votes",      response: VoteResponse,       fixture: "vote",       request: VoteRequest },
  results:    { method: "GET",  path: "/results",    response: ResultsResponse,    fixture: "results" },
  challenger: { method: "POST", path: "/challenger", response: ChallengerResponse, fixture: "challenger", request: ChallengerRequest },
} as const;
```

Semantics both sides rely on:
- `GET /variants` returns the **active round** only (round 1 until the challenger runs, then round 2).
- `POST /votes` is idempotent on `(voterId, variantId)`: a repeat returns `{ ok: true, duplicate: true }`.
  An unknown variant or invalid body returns HTTP 400 `{ ok: false, duplicate: false, error }`.
- `POST /challenger` requires `adminToken === process.env.ADMIN_TOKEN`, otherwise HTTP 401
  `{ ok: false, error: "unauthorized" }`. It can take 30–90 s, so the UI shows a spinner.
- `GET /results` is cheap enough to poll every 3 s.

Fixtures (fixture mode returns these files verbatim):
- `fixtures/variants.json`: `{ round: 1, product, variants: [6] }`. Use the placeholder brand
  below. Live data replaces it, so the fixtures never need the real product.
- `fixtures/vote.json`: `{ "ok": true, "duplicate": false }`
- `fixtures/results.json`: 47 voters. Build it from the table below. Compute `lo`/`hi` with a
  throwaway Node script using the Wilson formula (z = 1.645). Never hand-type intervals.
- `fixtures/challenger.json`: `{ ok: true, round: 2, variants: [r2-incumbent (copy of r1-social_proof, parentId "r1-social_proof"), r2-c1, r2-c2] }`

Placeholder product (fictional, only for fixtures): brand "Crunchwell", name "Sea Salt Lentil
Crisps", price "£1.80", imageUrl "/product.jpg". Facts: "Made from red lentils", "13g protein
per 100g", "Baked, not fried", "Made in Yorkshire", "Vegan", "85g bag".

Results fixture table. Segment voters: student 14, young_pro 18, parent 6, fitness 7, other 2
(47 in total). Every voter saw all 6 ads. Graded (pooled) rates use only the 45 panel-segment voters; the 2 "other" voters appear only in their own cells.

| variant | taps student/young_pro/parent/fitness/other | total taps | AI P(tap) student/young_pro/parent/fitness |
|---|---|---|---|
| r1-social_proof | 11/12/3/4/1 | 31 | .6/.6/.4/.5 |
| r1-scarcity | 6/6/2/2/1 | 17 | .5/.4/.3/.3 |
| r1-health_halo | 4/8/3/6/1 | 22 | .6/.7/.8/.9 |
| r1-indulgence | 10/10/2/3/2 | 27 | .6/.5/.4/.4 |
| r1-provenance | 5/10/5/3/1 | 24 | .5/.6/.8/.6 |
| r1-value | 9/7/2/1/1 | 20 | .6/.4/.5/.3 |

The story this fixture tells: the AI overrated **health halo** by about 25 points, which is the
positive skew the literature warns about, while humans picked **social proof**. Pooled AI
values are post-stratified to the room's mix (weights 14/18/6/7 over 45). Expect
`aiPickedWinner: false`, MAE ≈ 0.10 and Spearman ≈ 0.49.

## Experiment rules (non-negotiable; judges are researchers)

1. **Truthful copy.** Variants may only claim `product.facts`. No invented numbers, reviews,
   awards or "loved by X people". Social proof and scarcity must be phrased without fabricated
   stats. Every ad shows a small "Concept test, not a real ad" label (frontend).
2. **Seal before votes.** `data/forecasts/round-N.json` is written, hashed, committed and
   pushed before that round's first vote. The dashboard prints `sealedAt` and the first 8
   characters of the hash.
3. **Balanced exposure.** Every voter sees every active-round variant, in a per-voter random
   order. No adaptive allocation.
4. **Honest stats.** 90% Wilson intervals. Segment cells claim nothing when n < 10. MAE and
   Spearman use only variants with n ≥ 10.
5. **Privacy.** Store only a random voterId, the segment, the choices, dwell time and a server
   timestamp. Show a consent line on the vote page. `data/votes.jsonl` may be published
   because it holds no PII.

---

## T1 — Forkcast backend

**Description:** Everything behind the four contract endpoints: the vote store, the stats, the
sealed AI forecasts, the challenger loop, and the evidence pack (README). The lunch-critical
path is T1.1–T1.2; everything in T1.3 is cut first if the clock slips.

### T1.1 — Foundation (joint, 12:45–13:05)

**Description:** One shared scaffold and a frozen contract, so the two people never block each other.

#### T1.1.1 — Scaffold, contract, fixtures, remote

**Description:**
- Copy the template into the repo root:
  `cp -R ~/.claude/skills/hackathon/template/. . && cp .env.example .env`.
  Do NOT run `init.sh` here: it refuses a non-empty directory and would create a nested git repo.
- Add to `.env`: `ANTHROPIC_API_KEY=`, `ADMIN_TOKEN=<random 24 chars>`, `DATA_DIR=../../data`.
- Paste the shared contract into `packages/contract/src/schemas.ts` and `endpoints.ts`.
- Write the 4 fixtures and delete the template's `items`/`metrics` fixtures, routes, store
  fields and web components (`components/metrics/*`, `components/records/*`). Replace
  `apps/web/src/app/page.tsx` with a stub that links to `/vote`, `/dashboard` and `/qr`.
- `pnpm install --frozen-lockfile`. Commit.
- Create the public GitHub repo and push: `gh repo create <name> --public --source . --push`.
  **Ask Richard before running this; it publishes the repo.** The teammate then clones it.
- Add `tasks/` to `.git/info/exclude`.

**Verify:**

```bash
# tier1_build
pnpm -r typecheck
```

```bash
# tier2_simplify
# Run the code-simplifier:code-simplifier agent on: packages/contract/src/*.ts, apps/web/src/app/page.tsx, apps/api/src/**/*.ts
# Pass = no issues, or all fixed and tier1 re-run green.
```

```bash
# tier3_unit
# Behaviour: every fixture parses with the exact schema the API and the browser use.
pnpm fixtures:validate
```

```bash
# tier4_integration
# Fixture-mode web serves contract-valid JSON through the real proxy route.
(pnpm --filter web dev > /tmp/fk-web.log 2>&1 &) ; sleep 8
curl -sf localhost:3300/api/results > /tmp/fk-results.json
node --import tsx -e 'import { ResultsResponse } from "@hack/contract"; import { readFileSync } from "node:fs"; const r = ResultsResponse.parse(JSON.parse(readFileSync("/tmp/fk-results.json","utf8"))); if (r.voters !== 47) throw new Error("fixture voters != 47"); console.log("ok")'
pkill -f "next dev -p 3300"
```

### T1.2 — Lunch-critical path (13:05–13:55)

**Description:** The vote store and stats must be live on a public URL, with a sealed forecast, before 13:55.

#### T1.2.1 — Vote pipeline: store, stats, results, routes

**Requires:** T1.1.1

**Description:**
- `apps/api/src/data/store.ts`:
  - Reads `DATA_DIR` (default `../../data`): `product.json`, `variants/round-N.json`,
    `forecasts/round-N.json`, `state.json` (`{ activeRound }`) and `votes.jsonl`.
  - Seeds from `fixtures/variants.json` when `variants/round-1.json` is missing, so live mode
    works at minute one.
  - `addVote` appends one JSON line `{ ...vote, at: <server ISO UTC> }` with `appendFileSync`.
    It deduplicates on `voterId + variantId` in memory and rebuilds that set from the file on boot.
- `apps/api/src/lib/stats.ts` (pure functions):
  - `wilson(taps, n, z = 1.645) → { rate, lo, hi }` (all null when n = 0).
  - `spearman(xs, ys)` with average ranks for ties.
  - `mae(pairs)`.
  - `postStratify(aiBySegment, mix)`: weights are the room's voter counts over the
    PANEL_SEGMENTS; equal weights when nobody has voted yet.
- `apps/api/src/lib/results.ts`: a pure function
  `buildResults(votes, variantsByRound, forecastsByRound, activeRound, now) → ResultsResponse`.
  It must not touch the file system. Make it a pure function because it is the logic judges
  will question.
- Routes (one `app.route(...)` line each):
  - `routes/variants.ts`.
  - `routes/votes.ts`: zod-parse the body with `VoteRequest.safeParse` and return 400 on
    failure. Reject a variant that is not in the active round with 400.
  - `routes/results.ts`.
- `apps/api/scripts/smoke.ts`: against `BASE_URL`, posts a vote, posts the same vote again,
  posts an invalid vote, then GETs `/results`. It asserts: 200 then `duplicate: true`, 400 for
  the invalid vote, and `votes` incremented by exactly 1. Exits non-zero on any failure.
  Add `"smoke": "tsx scripts/smoke.ts"` to `apps/api/package.json`.
- Tests: `apps/api/src/lib/stats.test.ts` and `apps/api/src/lib/results.test.ts`. Each test
  states WHY in its name:
  - `wilson(30, 60)` ≈ [0.396, 0.604] ±0.005 ("intervals are what stop us overclaiming on stage").
  - `wilson(3, 6)` is wider than `wilson(30, 60)`.
  - `wilson(0, 10)` and `wilson(10, 10)` stay inside [0, 1].
  - `wilson(0, 0)` returns nulls.
  - `spearman` gives 1 for identical ranks and -1 for reversed ranks.
  - Duplicate `(voterId, variantId)` votes count once ("ballot stuffing must not move results").
  - A segment cell with 9 voters has `enough: false` and one with 10 has `enough: true`.
  - With a room of only students, the pooled `ai` equals the student forecast ("the AI is
    graded against the room it actually faced").
  - `aiPickedWinner` is true only when the argmax of ai equals the argmax of human rate among
    variants with n ≥ 10.
  - MAE and Spearman ignore variants with n < 10.

**Verify:**

```bash
# tier1_build
pnpm -r typecheck
```

```bash
# tier2_simplify
# Run code-simplifier:code-simplifier on apps/api/src/**/*.ts and apps/api/scripts/smoke.ts; re-run tier1 after fixes.
```

```bash
# tier3_unit
node --import tsx --test apps/api/src/lib/stats.test.ts apps/api/src/lib/results.test.ts
```

```bash
# tier4_integration
# Real server, empty temp data dir (seeds from fixtures), exercise dedupe + validation + counts.
export FK_DATA=$(mktemp -d)
mkdir -p $FK_DATA/forecasts && printf '%s' '{"round":1,"model":"smoke-stub","personasPerSegment":1,"perSegment":{},"answers":[],"sealedAt":"2026-10-03T12:00:00Z","sha256":"smoke-stub"}' > $FK_DATA/forecasts/round-1.json   # votes need a sealed round
(cd apps/api && DATA_DIR=$FK_DATA PORT=8799 node --import tsx src/index.ts > /tmp/fk-api.log 2>&1 &) ; sleep 3
BASE_URL=http://localhost:8799 pnpm --filter api smoke
test "$(wc -l < $FK_DATA/votes.jsonl)" -eq 1   # duplicate and invalid votes were not persisted
pkill -f "src/index.ts" ; true
```

#### T1.2.2 — AI panel: generate, forecast, seal, go live

**Requires:** T1.2.1. The frontend has supplied the real product facts (written to `data/product.json`) and `apps/web/public/product.jpg`.

**Description:**
- `apps/api/src/lib/llm.ts`: a thin OpenAI client. Use structured output (a tool or JSON schema)
  and parse every model response with zod before using it. Retry once on a parse failure,
  then throw with the raw text in the error message. Never swallow errors.
- `apps/api/src/lib/truth.ts`: `inventedNumbers(text, facts)` returns any digit sequence in the
  copy that appears in no fact. `generate.ts` rejects and regenerates a variant when this list
  is non-empty. This is a deterministic guard against invented stats.
- `apps/api/scripts/generate.ts`: reads `data/product.json` and writes
  `data/variants/round-1.json`, one variant per Lever with `round: 1` and `parentId: null`.
  The prompt includes the truth rule: copy may only use `product.facts`.
- `apps/api/src/lib/seal.ts` + `apps/api/scripts/forecast.ts --round N`:
  - Personas: create `data/personas.json` once (10 per PANEL_SEGMENT, each with a short bio:
    budget, food habits, what they're doing when they scroll) and reuse it in every round.
  - For each persona, show that round's variants in a shuffled order. Ask for
    `{ variantId, decision: "tap" | "scroll", reason }` for every variant. Run with concurrency 8.
  - Compute `P(tap | variant, segment)` = taps / 10.
  - Write `data/forecasts/round-N.json` with: model, personasPerSegment, perSegment
    probabilities, reasons, `sealedAt` (ISO UTC), and `sha256` over the canonical JSON
    (sorted keys, everything except `sha256` itself).
  - Print `sealed round N sha256=<first 8> at <time>`.
- `apps/api/scripts/verify-seal.ts --round N`: recomputes the hash and exits 1 on a mismatch.
- Seal ritual (shell, immediately after the forecast runs):
  `git add data/forecasts data/variants data/personas.json data/product.json && git commit -m "data: seal round-1 forecast" && git push`.
- Go live on your laptop:
  1. `set -a; . ./.env; set +a`
  2. `pnpm --filter api dev &`
  3. `DATA_MODE=live pnpm --filter web build && DATA_MODE=live pnpm --filter web start &`
  4. `cloudflared tunnel --url http://localhost:3300`
  5. Send the frontend person the trycloudflare URL for `/qr?u=<url>/vote`.
- Phone test: open `/vote` on 2 phones, one on mobile data and one on venue Wi-Fi. Complete all
  6 cards, then confirm `/results` shows 2 voters. Then empty `data/votes.jsonl` (test votes
  must not pollute the experiment) and restart the API.

**Verify:**

```bash
# tier1_build
pnpm -r typecheck
```

```bash
# tier2_simplify
# Run code-simplifier:code-simplifier on apps/api/src/lib/{llm,truth,seal}.ts and apps/api/scripts/{generate,forecast,verify-seal}.ts.
```

```bash
# tier3_unit
# Behaviour: the seal is reproducible and tamper-evident; the invented-number guard rejects fabricated stats.
node --import tsx --test apps/api/src/lib/seal.test.ts apps/api/src/lib/truth.test.ts
# seal.test.ts: re-hashing a saved forecast reproduces its sha256; flipping one probability changes it.
# truth.test.ts: "Loved by 10,000 Londoners" is flagged when no fact contains 10,000; "13g protein" passes when a fact has 13g.
```

```bash
# tier4_integration
# The sealed forecast on disk matches its own hash and was committed before any vote exists.
(cd apps/api && node --import tsx scripts/verify-seal.ts --round 1)   # exits 1 on sha256 mismatch
git log -1 --format=%cI -- data/forecasts/round-1.json                # prints the seal commit time
test ! -s data/votes.jsonl                                            # no votes recorded yet at seal time
curl -sf localhost:3300/api/variants > /tmp/fk-variants.json
node --import tsx -e 'import { VariantsResponse } from "@hack/contract"; import { readFileSync } from "node:fs"; const r = VariantsResponse.parse(JSON.parse(readFileSync("/tmp/fk-variants.json","utf8"))); if (r.variants.length !== 6) throw new Error("expected 6 live variants"); console.log("live ok")'
```

### T1.3 — After lunch (14:45–16:45)

**Description:** The challenger loop, then the evidence pack. **Cut rule:** if the dashboard is
not live on real data by 15:15, skip T1.3.1 and go straight to T1.3.2.

#### T1.3.1 — Challenger loop

**Requires:** T1.2.2, round-1 votes collected

**Description:**
- `routes/challenger.ts`: zod-parse `ChallengerRequest`. Return 401 unless the token matches.
  Return 409 `{ ok: false, error: "round 2 already active" }` if round 2 exists. Then:
  1. `lib/challenger.ts` `buildEvidence(results)`: pooled ranking with intervals, cells where
     `enough`, and the AI misses (variants where `aiInsideCi === false`).
  2. Ask the copy model (`OPENAI_MODEL_COPY`) for 2 challengers that keep the human winner's lever but fix
     its weakest segment, or that combine the top two levers. Each challenger's `rationale`
     must cite the numbers it used. Apply the same truth guard.
  3. Write `data/variants/round-2.json`: `r2-incumbent` (the round-1 human winner's copy,
     `parentId` = its id) plus `r2-c1` and `r2-c2`.
  4. Run the forecast for round 2 (reuse the forecast function), seal it, and set
     `state.json` `activeRound: 2`.
  5. Respond with `{ ok: true, round: 2, variants }`.
- Seal ritual for round 2 (commit + push) before the 16:00 round.

**Verify:**

```bash
# tier1_build
pnpm -r typecheck
```

```bash
# tier2_simplify
# Run code-simplifier:code-simplifier on apps/api/src/routes/challenger.ts and apps/api/src/lib/challenger.ts.
```

```bash
# tier3_unit
# Behaviour: the challenger prompt is built only from evidence that clears the n >= 10 bar.
node --import tsx --test apps/api/src/lib/challenger.test.ts
# challenger.test.ts: buildEvidence() excludes cells with enough=false; names the human winner; lists AI misses.
```

```bash
# tier4_integration
# A wrong admin token can never start a round (attendees share the same public URL).
export FK_DATA=$(mktemp -d)
(cd apps/api && DATA_DIR=$FK_DATA PORT=8799 node --import tsx src/index.ts > /tmp/fk-api.log 2>&1 &) ; sleep 3
test "$(curl -s -o /dev/null -w '%{http_code}' -X POST localhost:8799/challenger -H 'content-type: application/json' -d '{"adminToken":"wrong"}')" = "401"
pkill -f "src/index.ts" ; true
```

#### T1.3.2 — Evidence pack (README + data snapshot)

**Requires:** T1.2.2

**Description:** Docs-only stage, so tiers 1, 3 and 4 are skipped per protocol; Tier 2 still runs.
- Write `README.md`. It is the judges' entry point and must cover:
  - What it is (one paragraph).
  - How to run it: install, `.env`, the fixture vs live data modes, the tunnel.
  - **Method:** levers, within-subject exposure, randomised order, Wilson 90% intervals,
    post-stratification, the n ≥ 10 rule.
  - **Synthetic data:** how the personas and forecast are made, why they're sealed, and how
    they were validated (against the room, with the round-1 MAE, Spearman and winner-hit numbers).
  - **Limitations:**
    - Convenience sample of hackathon attendees.
    - Stated tap intent, not real CTR or sales.
    - One execution per lever is not a law of behaviour.
    - Round-2 voters may have seen round 1.
    - Ballot stuffing is possible: anonymous IDs, no rate limit.
    - Self-reported segments.
    - Persona prompts may carry stereotypes.
  - **Beyond the hack:** a panel provider instead of the room; calibrating the AI per segment
    over many rounds; a privacy model (no PII); real per-run token costs from `usage` logs.
  - **Pre-existing work:** the hackathon template scaffold. Say what was built today.
- Commit the `data/votes.jsonl` snapshot (no PII) and both sealed forecasts.
- Run the Adversarial Review Gate from the global protocol on the whole repo, against this spec.

**Verify:**

```bash
# tier1_build
# skipped: docs-only stage. Untested here: nothing compiles. Build surface is covered by T1.2.2/T1.3.1 tier1.
```

```bash
# tier2_simplify
# Run code-simplifier:code-simplifier on README.md (clarity pass). Never skipped.
```

```bash
# tier3_unit
# skipped: docs-only stage. Behaviour is covered by the stats/results/seal/truth/challenger tests.
```

```bash
# tier4_integration
# skipped: docs-only stage. Live integration is covered by T1.2.2 tier4 and the phone test.
```

## Cut list (stays cut)

Real ad-platform integration, auth or accounts, multiple products, image generation, adaptive
allocation, "votes saved" (stretch only: retrospective vs uniform allocation, with a defined
baseline), digital twins of each voter (stretch), a database (JSONL is enough for under 1,000 votes).
