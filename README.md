# Forkcast

Sealed AI forecasts for food ads, graded by the lunch room. Built at EAT_HACK (Really Good Culture,
London, 3 October 2026), Track 1: Human Truth. Repo: https://github.com/richard7ao/forkcast

Generation is free, validation is scarce. AI writes ads in an afternoon that used to take months, but
nobody knows which ad works for which audience until money is spent. Forkcast takes one real product
from The Shelf (EPIC Snax giant toastin' marshmallows), makes six ads that each express one behavioural
lever, and has an AI persona panel forecast the result. The forecast is sealed in public git history
before anyone votes. Real people then vote and the dashboard grades the AI against the room. The
outcome is stated tap intent, not CTR or sales, and every AI number is labelled as a forecast.

## How it works

1. **Pack facts.** A vision model (gpt-6.1-sol) reads the claims printed on phone photos of the pack
   (300g, produced in Belgium, gluten free) and a human checks them. Ad copy may use only these.
2. **Six lever ads.** gpt-6.1-sol writes one ad per lever: social proof, scarcity, health halo,
   indulgence, provenance, value. A deterministic guard (`apps/api/src/lib/truth.ts`) rejects copy
   with a number that is in no pack fact (it checks digits, not meaning). Every ad in a round shares
   one hero visual (gpt-image-2, from a real photo of the pack), so differences come from the copy.
3. **Sealed AI forecast.** 40 personas (10 each: student, young professional, parent, fitness;
   gpt-5.4-mini) say tap or scroll for every ad. The forecast is hashed (sha256 over canonical JSON),
   timestamped, then committed and pushed to this public repo before the round's first vote.
4. **Lunch room vote.** Attendees scan a QR code, pick a segment and see all six ads in random order,
   answering "Would tap" or "Scroll past" (30 seconds, anonymous). Each ad says it is a concept test.
5. **Challenger round.** Results go back to gpt-6.1-sol, which writes two challenger ads citing the
   numbers it used. A second forecast is sealed and the challengers face the round-1 winner. Judges
   vote at the finals (`/vote?seg=judge`).

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

Live on `/dashboard`; round 2 and the judges' column appear there once run. By chance the AI names the
human winner 1 time in 6, and Spearman is coarse with six ads. The seal commit must predate the first
vote, and `data/votes.jsonl` (committed, no PII) lets you recompute every number:

```bash
pnpm --filter api verify-seal --round 1                    # recompute the sha256, exit 1 on mismatch
git log --format='%H %cI' -- data/forecasts/round-1.json   # seal commit and its time
head -1 data/votes.jsonl                                   # first vote and its server timestamp (at)
```

## Method

- **Levers.** One lever per ad, same facts and visual, so the copy is the only variable.
- **Exposure.** Every voter sees all six ads in a random order (seeded per voter), so each ad's n
  equals the voter count. No adaptive allocation. Votes are idempotent on (voterId, variantId).
- **Outcome and intervals.** Stated tap intent, never CTR, ROAS or sales. 90% Wilson intervals
  (z = 1.645) on every tap rate.
- **Post-stratification.** The forecast is per segment. The pooled AI figure is re-weighted to the
  room's own mix of the four panel segments, so the AI is graded against the room it faced. "Other"
  voters count in the human rate but have no AI forecast. Judges are excluded from pooled results
  and get their own column at the finals.
- **n >= 10 rule.** A segment cell claims nothing below ten voters ("insufficient evidence"). MAE and
  Spearman use only ads with n >= 10, Spearman needs at least three, and the winner hit compares the
  AI's top ad with the human top ad among those ads.

## Synthetic data

- **Created.** 40 personas (10 per panel segment) with short bios (budget, food habits, what they are
  doing when they scroll) are made once and reused every round. Each persona sees a round's ads in a
  seeded shuffle and answers tap or scroll, with a reason, for each. P(tap | ad, segment) is taps
  divided by 10. The prompt carries a realism line ("most people scroll past most ads") to counter
  the known positive skew of synthetic panels.
- **Sealed.** A forecast written after the votes could be tuned to fit them. The file (model, every
  persona answer and reason, P(tap) per ad and segment, `sealedAt`) is hashed with sha256 over
  canonical JSON (sorted keys, all but the hash itself) and pushed to this public repo before the
  round's first vote, so git history is the pre-registration. The forecast script refuses to re-seal
  a round or to seal one that has votes. The panel is not deterministic, so the sealed file is the
  record. Commit dates are client-set, so GitHub's push events are the server-side proof.
- **Validated.** Against the room each round: winner hit, MAE of tap rate, Spearman, and whether each
  AI value falls inside the 90% interval. The panel is under test, not evidence about people.
- **Known failure modes** (reported figures from the literature, not our results):
  - PyMC Labs (Maier et al., arXiv 2510.08338): on purchase intent across 57 personal care product
    surveys (9,300 human responses), synthetic respondents reach 90% of human test-retest
    reliability. They elicit Likert ratings by semantic similarity; we ask for a binary tap.
  - Synthetic panels skew positive: an audit of LLM survey respondents (arXiv 2608.14606) finds an
    acquiescence shift in every model tested, and a model crowd more similar to itself than to humans.

## Limitations

- Convenience sample of hackathon attendees, not shoppers. The room is small, so intervals are wide.
- Stated tap intent, not CTR or sales. There was no ad spend.
- One execution per lever is not a law of behaviour: a win means this copy beat the others.
- Round-2 voters may have seen round 1, so familiarity can contaminate the challenger comparison.
- Ballot stuffing is possible: voter IDs are anonymous (a random UUID per browser), with no rate limit.
- Segments are self-reported, and persona prompts may carry stereotypes about each segment.
- The panel reads the ad text plus a description of the visual. People see the rendered ad.
- The AI image may alter label details. A human checked it against the pack.
- One product, one room, one afternoon: a single graded forecast, not a validation study.

## Beyond the hack

- **A panel provider instead of the room.** A recruited research panel with quotas matched to the
  target audience replaces the lunch room. The sealing and scoring protocol is unchanged.
- **Calibrating the AI per segment (the trust map).** Each graded round adds a point per ad, lever and
  segment; over many rounds a brand sees where the panel is reliable and where it over-rates.
- **Privacy.** No PII: a random voter ID, the picked segment, the choices, dwell time and a server
  timestamp, after a consent line. A real brand would hold the votes and publish only the seals.
- **Cost and scale.** Real token totals from the usage log: TBD. AI cost scales with personas, ads and
  rounds, not voters. JSONL suits under about 1,000 votes; beyond that, a database.
- **Security.** zod validates every request and every model reply, votes are idempotent, and
  `POST /challenger` needs an admin token because attendees share the public URL. Keys live in the
  git-ignored `.env`. Production would add rate limits and one-vote-per-person checks.

## Run it

```bash
pnpm install --frozen-lockfile   # Node 22 and pnpm 9 (`corepack enable`)
pnpm dev                         # fixture mode (fictional product, fake votes): web :3300, API :8787
```

For live mode, create `.env` from `.env.example` (never overwrite or commit it) and fill it in:

```bash
OPENAI_API_KEY=                 # all model calls; not needed in fixture mode
ADMIN_TOKEN=                    # gates POST /challenger; use a long random value, not the example
DATA_DIR=../../data             # live data, relative to apps/api
DATA_MODE=fixture               # fixture (default) or live
API_URL=http://localhost:8787   # where the web proxy finds the API
```

tsx and Next do not read the root `.env`, so export it (`set -a; . ./.env; set +a`) before running
`DATA_MODE=live pnpm dev`. `scripts/go-live.sh` does that itself, builds the web app, starts the API
and web in live mode, opens a cloudflared quick tunnel and prints the URLs to open:
`/qr?u=<tunnel URL>/vote` (lunch laptop) and `/dashboard?admin=<ADMIN_TOKEN>` (big screen, challenger).

```bash
pnpm --filter api probe                  # preflight: key valid, both text models honour strict JSON
pnpm --filter api facts                  # read pack facts from the pack photos (not committed)
pnpm --filter api visual                 # gpt-image-2 hero visual from the same photo
pnpm --filter api generate               # six lever ads for round 1, from the committed product.json
pnpm --filter api forecast --round 1     # persona panel, then the sealed forecast
pnpm --filter api verify-seal --round 1  # recompute the sha256, exit 1 on mismatch
BASE_URL=http://localhost:8787 pnpm --filter api smoke   # dedupe, validation, counts on a live API
pnpm test                                # API unit tests (Node's runner)
```

## Repo map

```
apps/api/            Hono API. src/lib: llm.ts (every OpenAI call: plain fetch, zod-validated JSON),
                     truth.ts, seal.ts, panel.ts, stats.ts, results.ts (pure). scripts/: commands above
apps/web/            Next.js pages /vote, /qr, /dashboard and the /api proxy
packages/contract/   zod schemas and the four-endpoint registry (variants, votes, results, challenger)
fixtures/            contract-valid sample responses for fixture mode
data/                product.json, variants/, forecasts/ (sealed), personas.json, votes.jsonl
scripts/go-live.sh   live server plus public tunnel
```

**Pre-existing work.** A generic contract-first dashboard template (pnpm workspaces, zod contract
package, Hono API, Next.js app, fixtures). Everything Forkcast-specific was built at EAT_HACK on 3
October: lever ads, number guard, persona panel, sealing, vote store, stats, pages, visual, challenger.

Team docs: `docs/designs/forkcast.md` (design record), `docs/superpowers/specs/backend.md` and
`frontend.md` (specs and the frozen contract), `docs/decisions.md` (decision log).

Built at EAT_HACK (Really Good Culture, London, 3 October 2026) by a two-person team with Claude Code.
