# Forkcast

Survival of the fittest for ads. Upload one product photo, get 48 Meta-style ads in minutes, and let a
simulated experiment kill the losers until one winner is left. Real people are the optional ground truth.

Built at EAT_HACK (Really Good Culture, London, 3 October 2026), Track 1: Human Truth.
Repo: https://github.com/richard7ao/forkcast

A food brand spends months ideating, making, revising and signing off one campaign, and it is one big
bet. AI made ads free to make; knowing which ad works, and for whom, is still slow and expensive.
Forkcast turns that into a loop that runs in minutes: generate many, test cheaply, keep the fittest,
breed, repeat. Demo product: EPIC Snax Co. Giant Toastin' Marshmallows, a real pack from The Shelf.

## How it works

1. **Upload one image.** An existing marketing image or a product photo.
2. **Read the pack.** A vision model extracts the claims printed on it (300g, gluten free, produced in
   Belgium). Ad copy may use only those facts.
3. **Generate 48 ads.** 8 AI-rendered scenes x 6 behavioural copy levers (social proof, scarcity, health
   halo, indulgence, provenance, value), every scene rendered from the one source image.
4. **Run a simulated experiment.** An AI shopper panel gives each ad a tap rate per audience. Their
   equal-weight mean x 0.05 is the ad's "true" click rate in a Meta-style delivery simulation: a
   Thompson-sampling bandit spends 10,000 simulated impressions, so budget flows to winners and losers
   starve. The resulting CTR is always labelled simulated.
5. **Survive and breed.** The top 6 survive, at most 2 per lever so one idea cannot fill the field. Each
   breeds 4 children (copy and scene mutations): 6 survivors + 24 children = 30 ads in generation 1.
6. **Repeat, then ship.** Simulate again, crown one winner, and export the survivors as a Meta Ads
   Manager bulk-import CSV (core columns). Each generation's fitness table is sealed with sha256.

```
photo -> pack facts -> 48 ads --> AI panel --> delivery sim ----> top 6 survive
(vision) (truth guard) 8 scenes x  tap rate     Thompson bandit,   max 2 per lever
                       6 levers    per audience 10,000 impr.            |
                                                                        v
winner -> meta.csv <- simulate again <- gen 1: 30 ads <- breed 24 children
(every generation's fitness table is sealed with sha256)
```

## The technology

- **Vision facts.** `gpt-6.1-sol` reads the claims printed on the pack. For the demo pack a human checked
  them against the photo. Copy may claim only these facts.
- **Truth guard.** `apps/api/src/lib/truth.ts` rejects copy with a number no pack fact backs ("Loved by
  10,000 Londoners") or a banned claim phrase (awards, "sold out", diet labels the pack cannot carry,
  spelled-out numbers). It matches words, not meaning. Failing copy is re-asked, never shipped.
- **Scene renders.** `gpt-image-2` edits the one source photo into 8 scenes. A human checks label fidelity.
- **AI shopper panel.** 100 fictional personas, 25 per audience (student, young professional, parent,
  fitness); a campaign screens with 40 of them, each rating 12 ads. Ads appear under neutral labels
  ("Ad 1"), never lever names that would cue the model. The prompt says "in real life most people scroll
  past most ads", a deliberate counter to the known positive skew of synthetic panels.
- **Delivery simulation.** `apps/api/src/lib/simulate.ts`: a seeded Thompson-sampling bandit shows each of
  the 10,000 impressions to the ad with the highest Beta(1 + clicks, 1 + misses) draw, then clicks at
  that ad's simulated rate. Twenty snapshots drive the budget-flow view.
- **Selection and breeding.** Rank by posterior mean simulated CTR, (clicks + 1) / (impressions + 2), at
  most 2 per lever. Each of the 6 survivors gets 3 copy mutations and 1 re-rendered scene.
- **sha256 seals.** `sealGeneration` hashes a generation's fitness table (each ad's genome, panel rates
  and simulated delivery) over canonical JSON. The room-test scripts push a round's seal to this public
  repo before anyone votes, so the AI is graded, not trusted.
- **zod contract.** `packages/contract` holds the schemas and the endpoint registry. The API validates
  its inputs and every model reply; the web app reads the same types.
- **Fixture mode.** `pnpm dev` serves `fixtures/*.json`, including a finished campaign (`demo-epic`), so
  the UI runs with no key and no backend.

## Results (EPIC Snax run, simulated)

| Ads generated | Generations | Winner | Simulated CTR, winner vs median | Tokens | Wall time |
| --- | --- | --- | --- | --- | --- |
| 72 (48 + 24 children) | 2 | "0g fat mallows. Fire up the s'mores." (health halo) | 3.1% (56 / 1,831) vs 0.8% | 237k | 4 min 17 s |

Generation 0 took 156 s and 127k tokens, generation 1 took 101 s and 110k. The median is generation 1's. All six
generation-1 survivors are children, so breeding beat every parent. Seals: generation 0 sha256
`08f47febdfbbb593cdab7e39575379d562141d61697a09f4dc923afbdcdb5439`, generation 1 sha256
`425fb2f196ec55538d32d7616135ab911c06fb274f8e4c14c6e6aeb35402aae3`. Every CTR here is simulated (panel tap
rate x 0.05).

## Real people: Watch Humans (concept demo)

`/watch-humans` shows where real people come in. [Watch Humans](https://watchhumans.com/) is Really Good
Culture's app that sends members free products to review on video. In the demo, a member claiming a free
sample first swipes on the brand's finalist ads (the last generation's survivors and winner): right if they
would tap, left if they would scroll past. Beside the phone, the brand sees each finalist's simulated CTR next
to the share of members who would tap, and whether people agree with the AI's pick. The members' pick uses the
engine's selection rule (posterior mean), and a tie is shown as a tie. Swipes stay in the browser tab: nothing
is sent to Watch Humans or stored. Wiring it for real is one route that fills the existing `fitness.human` field.

## Honesty and limits

- **Simulated is not real.** The experiment pushes AI personas' stated tap intent through a delivery
  simulation. It is not CTR, ROAS or sales, and no ad money was spent. Every simulated number says so.
- **The panel is under test, not trusted.** Reported figures from the literature, not our results:
  - PyMC Labs (Maier et al., arXiv 2510.08338): on purchase intent across 57 personal care product
    surveys (9,300 human responses), synthetic respondents reach 90% of human test-retest reliability.
    They elicit Likert ratings by semantic similarity; we ask for a binary tap.
  - Synthetic panels skew positive: an audit of LLM survey respondents (arXiv 2608.14606) finds an
    acquiescence shift in every model tested, and a model crowd more similar to itself than to humans.
- **Screening reads scenes as text.** To keep calls cheap the panel gets each scene as a description,
  never the render, and a generation-0 ad gets about 10 ratings. Personas are fictional and may carry
  stereotypes.
- **Image label fidelity is checked by a human.** `gpt-image-2` can alter label details, so a person
  compares each survivor's image with the pack before anything ships.
- **One execution per lever, one product, one run.** A winner says which execution won and what that
  suggests about its lever, not a law of behaviour.

## Beyond the hack

Written up, not built today:

- **Meta Marketing API.** Run the survivors as real ads on a small budget and read real CTR back as the
  fitness signal: the simulation becomes the cheap prior, Meta's delivery the judge.
- **Shopify.** The same loop on product-page photos, with add-to-cart rate as fitness.
- **Scale.** Today one job runs at a time, in-process, and campaigns are JSON files. Next: a job queue,
  a database, and a quota-matched research panel beside the synthetic one.
- **Privacy.** The loop uses no personal data: the input is the brand's own image and the panel is
  fictional. The optional room test stores a random ID, segment, answers and timing, after a consent line.
- **Security.** Today: zod at the API boundary and on every model reply, an image size cap, and an admin
  token (16+ characters) on evolve and the challenger. Production needs per-brand auth, upload rate
  limits and spend caps.
- **Cost.** Tokens per run are in the results table. Cost follows ads x personas x generations, not audience
  size, and image renders rather than tokens set the wall time.
- **Data ownership.** The brand owns its image, creatives and results. A seal is only a hash, so in
  production the table can stay private and be revealed later to prove the verdict came first.

## Run it

```bash
pnpm install --frozen-lockfile   # Node 22 and pnpm 9 (`corepack enable`)
pnpm dev                         # fixture mode, no key needed: web http://localhost:3300, API :8787
```

Fixture mode serves the finished demo campaign, so Run on the upload page opens `/campaigns/demo-epic`.
For live mode, create `.env` from `.env.example` (never overwrite or commit it):

```bash
OPENAI_API_KEY=                 # every model call; not needed in fixture mode
ADMIN_TOKEN=                    # 16+ characters (`openssl rand -hex 16`); gates evolve and the challenger
DATA_DIR=../../data             # relative to apps/api; campaigns persist to DATA_DIR/campaigns/<id>.json
DATA_MODE=fixture               # fixture (default) or live
API_URL=http://localhost:8787   # where the web proxy finds the API
```

tsx and Next do not read the root `.env`, so export it first: `set -a; . ./.env; set +a; DATA_MODE=live pnpm dev`.
The Evolve button appears only with `?admin=<ADMIN_TOKEN>` in the URL. Endpoints: `POST /campaigns`,
`GET /campaigns/:id`, `POST /campaigns/:id/evolve` (admin), `GET /campaigns/:id/meta.csv`.

```bash
pnpm check                               # fixtures:validate + typecheck; run before every push
pnpm test                                # API unit tests (Node's runner)
pnpm --filter api probe                  # preflight: key valid, both text models honour strict JSON
pnpm --filter api facts                  # read pack facts from pack photos (photos are never committed)
pnpm --filter api visual                 # gpt-image-2 edit of a source photo; --scene for an ad scene
pnpm --filter api verify-seal --round 1  # recompute a sealed forecast's sha256, exit 1 on mismatch
pnpm --filter api smoke                  # vote pipeline check on a scratch API (:8799); stores a vote
```

## Optional real-people test

`/vote-lite` is a phone page for a room: each person sees a round's ads one at a time and answers "Would
tap" or "Scroll past", anonymously (random ID, segment, answers, timing). A round's AI forecast is sealed
and pushed before it opens: `scripts/seal-round.sh <round>`, then `scripts/open-round.sh <round>`.
`scripts/go-live.sh` serves it through a cloudflared tunnel. It is not part of the simulated results above.

## Pre-existing work, and what was built today

**Pre-existing:** a generic contract-first dashboard template (pnpm workspaces, a zod contract package, a
Hono API, a Next.js app, fixtures).

**Built at EAT_HACK on 3 October (everything Forkcast-specific):** vision pack facts, the truth guard, lever
copy, `gpt-image-2` scene renders, the persona panel and its sealing, the delivery simulation, selection and
breeding, the campaign API and pages (upload, generation rail, ad grid, winner panel, analytics), the Meta
CSV export, the Watch Humans concept demo (`/watch-humans`), and the optional room-test pipeline (vote store,
`/vote-lite`, stats, challenger).

Docs: `docs/pitch.md`, `docs/decisions.md` (every call, with reasons), `docs/analysis-plan.md`,
`docs/superpowers/specs/`. Built by a two-person team with Claude Code.
