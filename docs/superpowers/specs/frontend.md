# Forkcast Frontend — Spec

> **Who this is for:** the frontend person on the two-person EAT_HACK team (and their Claude Code).
> The backend person works from `docs/superpowers/specs/backend.md`. The sections "What we are
> building", "Shared contract" and "Experiment rules" are copied verbatim from backend.md.
> The contract is frozen at 13:05; after that, ask the backend person before relying on any new field.

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
(47 in total). Every voter saw all 6 ads, so each variant has n = 47 pooled.

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

## Your role

You own every screen and the people work:
- `/vote`, used on attendees' phones. This is the most important screen in the project.
- `/qr`, the laptop you carry round the lunch room.
- `/dashboard`, used on the big screen, in the video and at the finals.
- The product photo and facts.
- Working the room at 14:00 and 16:00.
- The ≤2-minute video and the submission.

| You own | Backend owns | Nobody edits during the sprint |
|---|---|---|
| `apps/web/src/app/**` pages (not the proxy route), `apps/web/src/components/**`, new helpers in `apps/web/src/lib/`, `apps/web/public/**`, `data/product.json` (the only file in `data/` you touch) | `packages/contract/**`, `apps/api/**`, `fixtures/**`, the rest of `data/**`, `README.md` | `apps/web/src/lib/client.ts`, `apps/web/src/lib/useEndpoint.ts`, `apps/web/src/app/api/[...path]/route.ts`, `packages/contract/src/fixtures.ts` |

## Timeline (BST, today)

| Time | You | Backend |
|---|---|---|
| 12:45–13:05 | Pick the Shelf product: a clear pack, true claims on it, a brand the judges know. Take 2 photos and write `data/product.json`. Pair on the contract (T2.1.1) | Scaffold, contract, fixtures, push |
| 13:05–13:45 | T2.2.1 `/vote` + `/qr` against fixtures | Vote pipeline |
| 13:45–13:55 | Push `/vote`. Test on 2 phones through the tunnel with the backend. **`/vote` is frozen after this** | Seal forecast, go live, tunnel |
| 14:00–14:45 | **Work the room.** Carry `/qr` on a laptop. Ask the organisers for 30 seconds at the mic | Keep the server up |
| 14:45–15:15 | T2.3.1 `/dashboard` | Challenger endpoint |
| **15:15** | **CUT CHECK:** is the dashboard live on real data? No → skip T2.4.1 and polish the dashboard | Same |
| 15:15–16:00 | T2.4.1 challenger panel, round-2 flow, judge mode | Runs challenger, seals round 2 |
| 16:00–16:20 | Work the room again (round 2) | Server up |
| 16:20–16:45 | Freeze the UI. Ask the backend for a final pull and rebuild | README, adversarial review |
| 16:45–17:15 | T2.4.2 record the video | Helps |
| 17:15–17:25 | Submit (form fields below) | — |
| 18:30 | Finals demo: judges scan `/vote?seg=judge` | Server + tunnel up |

## Environment gotchas

- **Build against fixtures.** `DATA_MODE=fixture` is the default. You never wait for the
  backend: `useEndpoint`/`fetchTyped` resolve from `fixtures/*.json` until live mode.
- **The live server runs on the backend laptop** (`next build && next start` + tunnel). Your
  changes reach phones only when the backend pulls and rebuilds, at 13:55, 14:45, 15:30 and
  16:15. Before asking for a pull, run `pnpm -r typecheck && pnpm --filter web build` and get
  green locally.
- **`/vote` is frozen at 13:55.** Sixty phones hit it. After that, only touch `/dashboard`,
  `/qr` and the challenger UI.
- **If your agent shell prints `_load_nvm: command not found`:** prefix commands with
  `unset -f node npm npx pnpm 2>/dev/null; . ~/.nvm/nvm.sh`.
- **UI kit:** Tailwind v4, the template's `components/ui` primitives and Recharts are already
  installed. Add no UI library. Optionally load the `frontend-design` skill for the dashboard pass.
- **Protocol:** if you use Richard's global protocol, init `tasks/frontend-state.json` from
  this spec (local only). Tests use Node's runner: `node --import tsx --test <files>`.

## Screens

### `/vote`: phones (mobile-first, 375 px wide, tap targets ≥ 48 px, no hover)

1. **Intro:** "30-second taste test. 6 ads. Anonymous." Consent line: "We store the group you
   pick and your answers, nothing else. Results are shown live and published in our public
   repo." Start button.
2. **Segment pick:**
   - Skip this step if `?seg=` holds a valid segment. `judge` is reachable only this way.
   - Otherwise show five big buttons: Student, Young professional, Parent, Into fitness,
     None of these (`other`).
3. **Cards:** fetch `/variants`, then order them with `shuffleSeeded(variants, voterId + round)`.
   - Each card is a Meta feed ad: brand initial avatar, brand name, "Sponsored", product
     image, headline, body, a CTA pill (not clickable), and a small "Concept test, not a real ad".
   - Below the card: two big buttons, **Scroll past** (left) and **Would tap** (right), plus
     progress "3 / 6". `dwellMs` = time from card render to the button press.
   - Votes are optimistic: advance at once and POST in the background via `fetchTyped("vote", { body })`.
     A failed POST goes into the localStorage queue (`fk-queue`), which flushes on the next
     success. A voter is never blocked by the network.
4. **Done:** "Thanks, your votes are in. Results are live on the big screen."
   - Set `fk-done-r{round}`. Reopening the page shows the done screen.
   - If `/variants` reports a newer round that isn't done, offer "New round: 3 more ads".

State:
- `fk-voter` holds a `crypto.randomUUID()`.
- If `/variants` fails, show a friendly retry screen.
- If the product image fails to load, show a brand-coloured block.
- Test on iOS Safari and Android Chrome.

### `/qr`: lunch laptop

- `?u=` holds the full public vote URL.
- Show a huge QR code: `<img src={"https://api.qrserver.com/v1/create-qr-code/?size=640x640&data=" + encodeURIComponent(u)} />`
  (zero dependencies). Also show the URL in large text, as a fallback for anyone who can't scan.
- Headline: "Which ad would you tap? 30 seconds. Anonymous."
- Live counter: poll `/results` every 3 s and show "47 people · 282 votes". The counter is
  social proof for turnout.
- Without `?u`, show "Open /qr?u=<public vote URL>".

### `/dashboard`: big screen, video, finals

Poll `/results` every 3 s. Fetch `/variants` on load and again after the challenger runs.
`app/dashboard/page.tsx` is a server component: it reads `process.env.DATA_MODE` and, in
fixture mode, shows a **"FIXTURE DATA, not live results"** banner. It passes the data down to
client components. Sections, top to bottom:

1. **Scorecard** (one per round in `scorecards`):
   - Winner line, e.g. "AI bet on **Health halo**. The room picked **Social proof**." with ✓/✗.
   - "AI was off by **10 pts** on average" (MAE × 100).
   - Spearman ρ.
   - Seal line: "Forecast sealed 12:52 UTC · sha256 3f9a1c2e · committed before the first vote".
   - Show "Waiting for votes" when `scorecards` is empty or its values are null.
2. **Leaderboard:** the round's ads as tiles in a grid, gimmegimme style, sorted by human rate.
   - Each tile reuses the compact `AdCard` from `/vote`.
   - Badges: "Tap intent 66% (54–76) · n 47", "AI forecast 56%", and ✓ "AI inside interval"
     or ✗ "AI miss".
3. **Segment heatmap:**
   - Rows are levers. Columns are the pooled rate first, then each segment present (including
     Judges at finals).
   - A cell shows the rate and n, with the AI value small beneath.
   - When `enough` is false, grey the cell and label it "insufficient evidence (n < 10)".
4. **Calibration plot** (Recharts): x = AI forecast, y = human rate with lo/hi error bars, plus
   a y = x diagonal. Label points by lever. This is the "where to trust the AI" picture.
5. **Challenger panel:**
   - With `?admin=<token>` present and round 1 active, show a **Create challenger** button. It
     POSTs `/challenger` with `{ adminToken }` and shows a spinner (30–90 s) and any error.
   - When round 2 is active, show the incumbent vs the challengers, each challenger's
     `rationale`, live head-to-head rates with intervals, and the round-2 seal line.
6. **Evidence card** (a modal on tile click), the approver's artifact:
   - The creative, human rate/interval/n, segment cells where `enough`, the AI forecast,
     `aiInsideCi`, and the seal (round, `sealedAt`, sha first 8).
   - Footnote: "Stated tap intent; convenience sample of EAT_HACK attendees."
   - Buttons: **Print** (`window.print()` with print CSS) and **Copy summary** (clipboard text).

Footer on every dashboard view: "Outcome = stated tap intent from EAT_HACK attendees
(convenience sample). AI forecast = synthetic persona panel, sealed before voting."

---

## T2 — Forkcast frontend

**Description:** Every screen people see: the phone vote flow, the QR/turnout screen, the
dashboard with the evidence card, and the challenger round. Plus the video and the submission.
T2.1–T2.2 are the lunch-critical path; T2.4.1 is cut first if the clock slips.

### T2.1 — Foundation (joint, 12:45–13:05)

**Description:** Pair on the scaffold and contract (the backend drives T1.1.1). Supply the real product.

#### T2.1.1 — Product photo, facts, and contract pairing

**Description:**
- Photograph the product on a plain background and save it as `apps/web/public/product.jpg`
  (1080 px wide, under 400 KB). A second shot in hand is optional.
- Write `data/product.json` (`Product` schema). `facts` must hold only claims printed on the
  pack: ingredients, protein, origin, vegan, size, price. Push by 13:30.
- Review the contract with the backend before the 13:05 freeze. Check that every field your
  screens need is present.

**Verify:**

```bash
# tier1_build
pnpm -r typecheck
```

```bash
# tier2_simplify
# Run code-simplifier:code-simplifier on data/product.json and any file you changed.
```

```bash
# tier3_unit
# Behaviour: the product file is contract-valid, has real facts, and the photo is small enough for venue Wi-Fi.
node --import tsx -e 'import { Product } from "@hack/contract"; import { readFileSync } from "node:fs"; const p = Product.parse(JSON.parse(readFileSync("data/product.json","utf8"))); if (p.facts.length < 3) throw new Error("need >= 3 pack facts"); console.log("product ok")'
test "$(stat -f%z apps/web/public/product.jpg)" -lt 400000
```

```bash
# tier4_integration
(pnpm --filter web dev > /tmp/fk-web.log 2>&1 &) ; sleep 8
test "$(curl -s -o /dev/null -w '%{content_type}' localhost:3300/product.jpg)" = "image/jpeg"
pkill -f "next dev -p 3300"
```

### T2.2 — Lunch-critical path (13:05–13:55)

**Description:** A phone completes 6 cards and every vote reaches the server, even on bad Wi-Fi.

#### T2.2.1 — `/vote` flow and `/qr` page

**Requires:** T2.1.1

**Description:**
- Files:
  - `app/vote/page.tsx`
  - `components/ad/AdCard.tsx` (also used by the dashboard)
  - `components/vote/*`
  - `app/qr/page.tsx`
  - `lib/shuffle.ts`, `lib/segment.ts`, `lib/voteQueue.ts`, each with a `*.test.ts`
- `shuffleSeeded(items, seed)` is deterministic: same seed, same order. Use a small seeded
  PRNG (mulberry32) over a hash of the seed.
- `parseSegmentParam(search)` returns a `Segment` or null. `judge` is accepted only from the param.
- `voteQueue`:
  - `enqueue(vote)` deduplicates on `voterId + variantId`.
  - `flush(send)` re-sends queued votes and removes them on success.
  - It is pure over an injected storage object, so it is testable without a browser.
- Tests, each named for WHY:
  - A refresh keeps the order: same seed, same order, so nobody sees a re-shuffled deck and
    double-votes.
  - The output is a permutation: no ad is dropped (balanced exposure).
  - 20 different seeds produce at least 10 distinct first cards: position bias is spread.
  - `?seg=judge` → `judge`; `?seg=hacker` → null; no param → null.
  - A failed send stays queued and is re-sent once on flush; a success leaves the queue.
    Enqueueing the same vote twice keeps one ("phones on bad Wi-Fi must not lose or double votes").

**Verify:**

```bash
# tier1_build
pnpm -r typecheck && pnpm --filter web build
```

```bash
# tier2_simplify
# Run code-simplifier:code-simplifier on apps/web/src/app/{vote,qr}/**, apps/web/src/components/{ad,vote}/**, apps/web/src/lib/{shuffle,segment,voteQueue}.ts
```

```bash
# tier3_unit
node --import tsx --test apps/web/src/lib/shuffle.test.ts apps/web/src/lib/segment.test.ts apps/web/src/lib/voteQueue.test.ts
```

```bash
# tier4_integration
# Pages render server-side and a vote round-trips through the real proxy route (fixture mode).
(pnpm --filter web dev > /tmp/fk-web.log 2>&1 &) ; sleep 8
curl -sf localhost:3300/vote -o /dev/null
curl -sf "localhost:3300/qr?u=https%3A%2F%2Fexample.com%2Fvote" -o /dev/null
curl -sf -X POST localhost:3300/api/votes -H 'content-type: application/json' -d '{"voterId":"smoke-0001","segment":"student","variantId":"r1-social_proof","tapped":true,"dwellMs":900}' > /tmp/fk-vote.json
node --import tsx -e 'import { VoteResponse } from "@hack/contract"; import { readFileSync } from "node:fs"; const r = VoteResponse.parse(JSON.parse(readFileSync("/tmp/fk-vote.json","utf8"))); if (!r.ok) throw new Error("vote not ok"); console.log("vote ok")'
pkill -f "next dev -p 3300"
```

### T2.3 — Dashboard (14:45–15:15)

**Description:** The screen the judges, the video and the finals all look at. It must render real data by 15:15.

#### T2.3.1 — Scorecard, leaderboard, heatmap, calibration, evidence card

**Requires:** T2.2.1

**Description:**
- Files: `app/dashboard/page.tsx` (server component with the fixture banner),
  `components/dashboard/*`, and `lib/format.ts` with `format.test.ts`.
- `lib/format.ts`:
  - `fmtPct(0.6596)` → "66%". `fmtPct(null)` → "—".
  - `fmtCi(rate)` → "54–76". It returns "—" when lo or hi is null.
  - `cellState(cell)` → "insufficient" | "ai-miss" | "ai-ok" | "no-ai".
  - `scoreLine(scorecard, variants)` → "AI bet on Health halo. The room picked Social proof."
- Tests, named for WHY:
  - `cellState` returns "insufficient" for any cell with `enough: false`, whatever its rate.
    "We never show a winner the data can't support."
  - `fmtCi` never prints "NaN".
  - `scoreLine` uses lever display names, never raw ids.

**Verify:**

```bash
# tier1_build
pnpm -r typecheck && pnpm --filter web build
```

```bash
# tier2_simplify
# Run code-simplifier:code-simplifier on apps/web/src/app/dashboard/**, apps/web/src/components/dashboard/**, apps/web/src/lib/format.ts
```

```bash
# tier3_unit
node --import tsx --test apps/web/src/lib/format.test.ts
```

```bash
# tier4_integration
# Fixture mode: the dashboard renders and shows the fixture banner (the guard against presenting fake data as live).
(pnpm --filter web dev > /tmp/fk-web.log 2>&1 &) ; sleep 8
curl -sf localhost:3300/dashboard > /tmp/fk-dash.html
grep -q "FIXTURE DATA" /tmp/fk-dash.html   # behaviour check: fixture mode must be labelled on screen
pkill -f "next dev -p 3300"
```

### T2.4 — Challenger, finals, submission (15:15–17:25)

**Description:** The second experiment and everything the judges receive. **Cut rule:** skip
T2.4.1 if the dashboard isn't live on real data at 15:15.

#### T2.4.1 — Challenger panel, round-2 flow, judge mode

**Requires:** T2.3.1; backend T1.3.1

**Description:**
- `lib/admin.ts`:
  - `readAdminToken(search)` → string | null.
  - `canCreateChallenger(token, activeRound)`: true only when there is a token and round 1 is active.
  - `needsNewRound(doneRounds, activeRound)`.
- The challenger panel follows the Screens section above.
- On `/vote`, after a done screen, offer the new round when `needsNewRound` is true.
- Judges column: the heatmap shows the "Judges" segment when present, honestly labelled
  "insufficient evidence" at n < 10.

**Verify:**

```bash
# tier1_build
pnpm -r typecheck && pnpm --filter web build
```

```bash
# tier2_simplify
# Run code-simplifier:code-simplifier on apps/web/src/lib/admin.ts and the challenger components.
```

```bash
# tier3_unit
# Behaviour: attendees (no token) can never see or fire the challenger; voters are offered round 2 exactly once.
node --import tsx --test apps/web/src/lib/admin.test.ts
```

```bash
# tier4_integration
# Fixture mode: the challenger POST round-trips through the proxy and parses with the contract.
(pnpm --filter web dev > /tmp/fk-web.log 2>&1 &) ; sleep 8
curl -sf -X POST localhost:3300/api/challenger -H 'content-type: application/json' -d '{"adminToken":"x"}' > /tmp/fk-ch.json
node --import tsx -e 'import { ChallengerResponse } from "@hack/contract"; import { readFileSync } from "node:fs"; const r = ChallengerResponse.parse(JSON.parse(readFileSync("/tmp/fk-ch.json","utf8"))); if (r.round !== 2) throw new Error("expected round 2"); console.log("challenger ok")'
pkill -f "next dev -p 3300"
```

#### T2.4.2 — Video and submission

**Requires:** T2.3.1

**Description:** Docs and human-work stage. Write `docs/video-script.md`, record, and submit.

Video, 2:00 maximum. Record with QuickTime screen recording plus voiceover. Upload as public or
unlisted (YouTube or Loom) so it opens without sign-in.

| Time | Show | Say |
|---|---|---|
| 0:00–0:15 | Title + brief | "Campaigns take months: ideate, create, revise, sign-off. AI made creating ads free. Knowing which one works, for whom, is still slow." |
| 0:15–0:35 | 6 ads + git commit of the sealed forecast | "One product from The Shelf, six ads, one behavioural lever each. Our AI panel predicted the winners, and we sealed that prediction in git before anyone voted." |
| 0:35–1:05 | Phone voting + dashboard | "At lunch, N of you voted. The AI bet on X; the room picked Y; it was off by Z points. Here's where you can trust it and where you can't." |
| 1:05–1:35 | Challenger panel | "The AI used that evidence to write a challenger. We sealed a second forecast and re-tested it at 16:00." |
| 1:35–1:50 | Evidence card | "This is what an approver signs off: creative plus evidence, in an afternoon." |
| 1:50–2:00 | README limits | "Stated intent, small convenience sample, all in the README. Next: real panels, and an AI calibrated per segment over many rounds." |

Form fields:
- Project name: Forkcast
- Team members
- Track: **Human Truth**
- Description (~150 words, draft below; fill in N and the product)
- Video URL
- Public repo URL
- Best Brand vote (3 from The Shelf)
- Live URL optional

Description draft:
> Forkcast pre-tests food ads in an afternoon instead of months. AI has made creating ad
> variants nearly free; the bottleneck is now knowing which ones work, for whom, before a brand
> spends money or asks for sign-off. For [product] from The Shelf, an LLM wrote six ads that
> differ in one behavioural lever each: social proof, scarcity, health halo, indulgence,
> provenance and value. A synthetic persona panel predicted which ads each shopper segment would
> tap, and we sealed that forecast with a SHA-256 hash committed to our public repo before anyone
> voted. At lunch, [N] EAT_HACK attendees voted on their phones. The dashboard grades the AI
> against real people with 90% intervals, shows where the AI can and can't be trusted, and turns
> the evidence into a challenger ad we re-tested at 16:00. The outcome is stated tap intent from
> a convenience sample; the README covers method and limits. Pre-existing work: a generic
> dashboard template; everything else was built today.

**Verify:**

```bash
# tier1_build
# skipped: docs/human stage. Untested here: no code changes. Build covered by T2.3.1/T2.4.1 tier1.
```

```bash
# tier2_simplify
# Run code-simplifier:code-simplifier on docs/video-script.md (clarity pass). Never skipped.
```

```bash
# tier3_unit
# skipped: docs/human stage. No logic changed; behaviour covered by format/admin/shuffle/segment/voteQueue tests.
```

```bash
# tier4_integration
# The submitted links must open without sign-in (submission rule).
curl -sfL -o /dev/null "$REPO_URL" && curl -sfL -o /dev/null "$VIDEO_URL" && echo "links public"
```

## Cut list (stays cut)

Swipe gestures (buttons are enough), animations beyond simple transitions, accounts, extra
pages, image generation, theming, and any second card, table or colour scale outside
`components/ui`.
