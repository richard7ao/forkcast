# Forkcast

Sealed AI forecasts for food ads, graded by the lunch room. Built at EAT_HACK (Really Good Culture,
London, 3 October 2026), Track 1: Human Truth. Repo: https://github.com/richard7ao/forkcast

Generation is free, validation is scarce. AI writes ads in an afternoon that used to take months, but
nobody knows which ad works for which audience until money is spent. Forkcast takes one real product
from The Shelf (EPIC Snax Co. Giant Toastin' Marshmallows), makes six ads that each express one
behavioural lever, and has an AI persona panel forecast the result. The forecast is sealed in public
git history before anyone votes. Real people then vote and the dashboard grades the AI against the
room. The outcome is stated tap intent, not CTR or sales, and every AI number is labelled a forecast.

## How it works

1. **Pack facts.** A vision model (gpt-6.1-sol) reads the claims printed on phone photos of the pack
   (300g, gluten free, produced in Belgium) and a human checks them. Ad copy may use only these.
2. **Six lever ads.** gpt-6.1-sol writes one ad per lever: social proof, scarcity, health halo,
   indulgence, provenance, value. A deterministic guard (`apps/api/src/lib/truth.ts`) rejects copy
   with a number no pack fact backs or a banned claim phrase (awards, "loved by", "sold out", diet
   labels); it matches words, not meaning. Every ad in a round shares one hero visual (gpt-image-2,
   from a real photo of the pack), so differences come from the copy.
3. **Sealed AI forecast.** 100 personas (25 each: student, young professional, parent, fitness;
   gpt-5.4-mini) say tap or scroll for every ad. The forecast is hashed (sha256 over canonical JSON)
   and timestamped, then committed and pushed to this public repo before the round's first vote.
4. **Lunch room vote.** Attendees scan a QR code, pick a segment and see all six ads in random order,
   answering "Would tap" or "Scroll past" (30 seconds, anonymous). Each ad says it is a concept test.
5. **Challenger round.** gpt-6.1-sol writes two challengers citing the round-1 numbers it used. A second
   forecast is sealed and they face the round-1 winner. Judges vote at the finals (`/vote?seg=judge`).

```
phone /vote --> cloudflared tunnel --> web :3300 --/api--> API :8787 --append--> data/votes.jsonl
laptop /qr, /dashboard <-- GET /api/results every 3 s -- buildResults(): Wilson 90%, post-stratified AI
scripts: generate -> data/variants/, forecast -> data/forecasts/ (sealedAt + sha256) -> git push = seal
```

## Results (round 1, lunch room)

| Voters | Votes | AI winner | Human winner | MAE (points) | Spearman |
| --- | --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD | TBD |

Sealed at TBD, sha256 TBD, commit TBD.

Voters and votes are the graded sample (the four panel segments); "None of these" and judges are
reported separately. The AI winner is the sealed pick. Read results as which execution won and what
that suggests about its lever: one execution per lever is not a law of behaviour. Intervals are 90%
Wilson, fixed before any data. [`docs/analysis-plan.md`](docs/analysis-plan.md), committed with the
seal, pre-registers the rest: a winner only if a paired within-voter interval separates it from the
runner-up, otherwise a tied top group; a bootstrap interval for MAE; chance for the winner hit (group
size / 6, or 1 in 6 for a lone winner); Spearman as descriptive only; opening times; the round-2 test.

To check the seal, re-hash the forecast, then compare GitHub's server-side push time for the seal
commit (the repository's Activity view; commit dates are client-set) with `opensAt` in
`data/state.json` and the first graded vote's `at` in `data/votes.jsonl`:

```bash
pnpm --filter api verify-seal --round 1                  # recompute the sha256, exit 1 on mismatch
git log -1 --format=%H -- data/forecasts/round-1.json    # the seal commit to look up on GitHub
```

## Method

- **Levers.** One lever per ad, same facts and visual, so the copy is the only variable.
- **Exposure.** Every voter sees every ad once, in a per-voter random order seeded by their anonymous
  id, so each card's position can be reconstructed for a fatigue check. No adaptive allocation; no
  per-ad results are shown to the room while a round is open. A repeat vote for an ad counts once.
- **Outcome.** Stated tap intent, never CTR or sales; 90% Wilson intervals (z = 1.645) on tap rates.
- **Who counts.** The graded sample is voters who pick a panel segment (student, young professional,
  parent, fitness). "None of these" and judges are shown separately and never graded. Votes before a
  round's opening time (phone tests) stay in the file and are excluded. Team members do not vote.
- **AI grading.** MAE uses the forecast post-stratified to the graded room's segment mix, over ads
  with n >= 10. A segment cell claims nothing below ten voters ("insufficient evidence").

## Synthetic data

- **Why a panel.** A sealed panel is fast, cheap and directional: it forecasts ads before anyone
  votes. It is an appropriate stand-in only because it is graded against real people, not trusted.
  It is not appropriate for lived experience or high-stakes launches without real respondents.
- **Created.** gpt-6.1-sol writes 25 fictional personas per panel segment (100 in total) with short
  bios (budget, diet, attitude to ads, what they do while scrolling). Each persona (gpt-5.4-mini, the
  same model in both rounds) sees a round's ads as neutral "Ad 1 to 6" in a seeded shuffle (lever
  labels never reach it) and answers tap or scroll with a reason. P(tap | ad, segment) is taps divided
  by 25, so the panel's own sampling error is up to about +/-10 points (one standard error) per
  segment cell. The prompt's realism line ("most people scroll past most ads") is a deliberate
  counter to the known positive skew.
- **Sealed.** A forecast written after the votes could be tuned to them. The file (model, persona
  answers and reasons, P(tap) per ad and segment, the pick, `sealedAt`) is hashed with sha256 over
  canonical JSON and pushed to this public repo before the round opens, so git history is the
  pre-registration. The headline pick uses equal segment weights. The forecast script refuses to seal
  a round that already has votes, and to re-seal without `--force`. The API rejects votes until a
  round's forecast exists, and `scripts/open-round.sh` opens a round only after its seal is pushed.
- **Validated.** Against the room each round: the sealed pick against the winner group, MAE with its
  bootstrap interval, and a trust map of the AI-minus-human gap per lever and segment ("trust it
  here" means the interval includes zero and is narrower than +/-15 points). The panel is under test.
- **Known failure modes** (reported figures from the literature, not our results):
  - PyMC Labs (Maier et al., arXiv 2510.08338): on purchase intent across 57 personal care product
    surveys (9,300 human responses), synthetic respondents reach 90% of human test-retest
    reliability. They elicit Likert ratings by semantic similarity; we ask for a binary tap.
  - Synthetic panels skew positive: an audit of LLM survey respondents (arXiv 2608.14606) finds an
    acquiescence shift in every model tested, and a model crowd more similar to itself than to humans.

## Limitations

- Convenience sample of hackathon attendees, not shoppers. The room is small, so intervals are wide
  and most segment cells will read "insufficient evidence": the pooled result is the claim.
- Stated tap intent, not CTR or sales. There was no ad spend.
- One execution per lever, one product, one room: a win says which execution won and what that
  suggests about its lever, not a law of behaviour. Round-2 voters may have seen round 1.
- Within-subjects exposure brings order and fatigue effects. Card order is randomised per voter and
  can be reconstructed from the seeded shuffle, so tap rate by position can be checked.
- Ballot stuffing is possible: voter IDs are anonymous (a random UUID per browser), with no rate limit.
  If the cloudflared tunnel restarts the public URL changes, and a new origin means a new voter ID.
- Segments are self-reported, and persona prompts may carry stereotypes about each segment.
- The panel reads the ad text and is told the ad shows a photo of the product; people see the real ad.
- The AI image may alter label details. A human checked it against the pack.
- Commit dates are client-set and force-push protection is not configured, so the sha256 and GitHub's
  push time carry the pre-registration.
- Whether an approver would sign the per-ad evidence card (rate, interval, seal) is untested.

## Beyond the hack

- **Scale.** Swap the lunch room for a research panel with quotas matched to the audience, and seal
  forecasts the same way across many products. JSONL suits under about 1,000 votes; beyond, a database.
- **Calibrating the AI per segment (the trust map).** Each graded round adds a point per ad, lever and
  segment; over many rounds a brand sees where the panel is reliable and where it over-rates.
- **Cost.** Real token totals (usage log): TBD. AI cost follows personas, ads and rounds, not voters.
- **Security.** Today: zod at the API boundary and on every model reply, idempotent votes, an admin
  token on the challenger, and no votes until a round is sealed. Production needs respondent
  verification (one person, one vote), rate limits and ballot-integrity checks.
- **Privacy and ownership.** No PII (random ID, segment, choices, dwell time, server timestamp), after a
  consent line. The brand owns the creative; respondent data is anonymous and deletable.

## Run it

```bash
pnpm install --frozen-lockfile   # Node 22 and pnpm 9 (`corepack enable`)
pnpm dev                         # fixture mode (fictional product, fake votes): web :3300, API :8787
```

For live mode, create `.env` from `.env.example` (never overwrite or commit it) and fill it in:

```bash
OPENAI_API_KEY=                 # all model calls; not needed in fixture mode
ADMIN_TOKEN=                    # gates POST /challenger; generate one with `openssl rand -hex 16`
DATA_DIR=../../data             # live data, relative to apps/api
DATA_MODE=fixture               # fixture (default) or live
API_URL=http://localhost:8787   # where the web proxy finds the API
```

tsx and Next do not read the root `.env`, so export it (`set -a; . ./.env; set +a`) before running
`DATA_MODE=live pnpm dev`. `scripts/go-live.sh` does that itself, serves a git worktree pinned to the
current commit, backs the vote log up every 2 minutes and opens a cloudflared quick tunnel. Open
`/qr?u=<tunnel URL>/vote` for the room (turnout only) and `/dashboard?admin=<ADMIN_TOKEN>` on that
laptop only. If the tunnel restarts its URL changes: reopen `/qr` with the new one.

```bash
pnpm --filter api probe                  # preflight: key valid, both text models honour strict JSON
pnpm --filter api facts                  # read pack facts from the pack photos (not committed)
pnpm --filter api visual                 # gpt-image-2 hero visual from the same photo
pnpm --filter api generate               # six lever ads for round 1, from the committed product.json
pnpm --filter api forecast --round 1     # persona panel, then the sealed forecast
pnpm --filter api verify-seal --round 1  # recompute the sha256, exit 1 on mismatch
scripts/seal-round.sh 1                  # generate, forecast, verify, commit and push the seal
scripts/open-round.sh 1                  # open the round (opensAt), only once its seal is on GitHub
pnpm --filter api smoke                  # vote pipeline check on a scratch API (:8799); stores a vote
pnpm test                                # API unit tests (Node's runner)
```

## Repo map

```
apps/api/            Hono API. src/lib: llm.ts (every OpenAI call: plain fetch, zod-validated JSON),
                     truth, seal, panel, forecast, stats, results (pure), challenger
apps/web/            Next.js pages /vote, /qr, /dashboard and the /api proxy
packages/contract/   zod schemas and the four-endpoint registry (variants, votes, results, challenger)
fixtures/, data/     sample responses for fixture mode; live data (sealed forecasts, votes, state)
scripts/             go-live.sh (server and tunnel), seal-round.sh, open-round.sh
```

**Pre-existing work.** A generic contract-first dashboard template (pnpm workspaces, zod contract
package, Hono API, Next.js app, fixtures). Everything Forkcast-specific was built at EAT_HACK on 3
October: lever ads, number guard, persona panel, sealing, vote store, stats, pages, visual, challenger.

Team docs: `docs/analysis-plan.md` (pre-registered rules), `docs/designs/forkcast.md` (design record),
`docs/superpowers/specs/backend.md` and `frontend.md` (specs, frozen contract), `docs/decisions.md`.

Built at EAT_HACK (Really Good Culture, London, 3 October 2026) by a two-person team with Claude Code.
