# Forkcast Backend — Spec (v2: evolution)

> For the backend person and their Claude Code. The frontend works from `frontend.md`. The
> "Product" and "API" sections are identical in both files. The contract code in
> `packages/contract/src/schemas.ts` is the source of truth; change it additively and tell the frontend.

## Product (identical in both specs)

**Forkcast is survival of the fittest for ads.**

1. A brand uploads one image: an existing marketing image or a product photo.
2. Forkcast reads the pack (vision), so ad copy can only claim what the pack says.
3. It generates ~50 Meta-style ad variants: 8 AI scenes × 6 behavioural copy levers = 48 ads,
   all rendered from the one image.
4. It runs **simulated experiments**. The AI shopper panel estimates each ad's tap rate per audience;
   a Meta-style delivery simulation (Thompson-sampling bandit, 10,000 simulated impressions) shifts
   budget to winners and starves losers. Real people (the room, later Meta) are the optional ground truth.
5. Only the fittest survive. Survivors **breed**: copy and scene mutations of the winners.
   Repeat until one ad holds the top spot.
6. The winner ships to Meta Ads (CSV export today, Marketing API later).

**Written up, not built today:**
- **Meta Marketing API:** real CTR becomes the fitness signal.
- **Shopify:** the same loop on product-page photos, with add-to-cart as fitness.

Every AI verdict is sealed (sha256) before people test, so the AI is graded rather than trusted.

## Already built (keep and reuse)

- **AI and data:**
  - `lib/llm.ts`: OpenAI via fetch, zod-checked JSON, retries.
  - `lib/truth.ts`: `inventedNumbers` and `bannedClaims`.
  - `lib/seal.ts`: sha256 over canonical JSON.
  - `lib/forecast.ts` + `lib/panel.ts`: 25 personas per segment, neutral "Ad N" labels, sees images.
  - `scripts/extract-facts.ts` (vision pack facts) and `scripts/render-visual.ts` (`gpt-image-2` edit, `--scene`).
- **Room testing:**
  - The `/variants`, `/votes`, `/results` routes: Wilson 90%, panel-segment grading, sealed pick, `opensAt`/`closesAt`.
  - The challenger: one-lever children of a winner. `evolve` supersedes it.
- **Live ops:** `scripts/{go-live,redeploy-live,seal-round,open-round}.sh`. The tunnel is live; `/vote-lite` is the phone page.
- **State:** round 1 is 6 EPIC Snax lever ads, sealed `5ef17f31` text-only. Per-ad scene images exist
  for 5 of 6 in `apps/web/public/generated/r1-*.png`.

## Evolution engine (new)

- **Genome:** `{ lever (1 of 6), scene (text), headline, body, cta }`. Image = `render(scene, sourcePhoto)`.
  Copy = LLM(lever, pack facts), guarded by `truth.ts`.
- **Gen 0:**
  - 8 scenes × 6 levers = 48 ads.
  - Renders: 8 images, medium quality, ~36 s each, 4 in parallel, so ~75 s.
  - Copy: one call per lever, 8 lines each.
- **Screen (fitness):**
  - AI panel of 40 personas (10 per segment). Each sees 12 random ads: scene described in text, copy verbatim.
  - So each ad gets ~10 ratings, giving P(tap) with a Wilson interval.
  - Text screening keeps calls near 1.5k tokens. Finalists are re-scored with the real images
    (images cost ~8k tokens per panel call).
- **Select:** keep the top 6 by Wilson **lower bound** (thin evidence can't win), at most 2 per lever (diversity).
- **Breed:** each survivor gets 4 children: 2 copy mutations (same lever, new headline/body) and 2 scene
  mutations (new scene, same copy). Next generation = 6 survivors + 24 children = 30. Screen and select again.
- **Stop:** after 2 evolutions, or when the top survivor holds for a whole generation.
- **Seal:** each generation's fitness table is sealed and pushed before people test its survivors.
- **Ground truth:**
  - Survivors go into a room round (existing pipeline: `seal-round.sh`, `open-round.sh`, `/vote-lite`).
  - The dashboard shows the AI rank vs the human rank.

## API (identical in both specs)

Existing room test: `GET /variants`, `POST /votes`, `GET /results`, `POST /challenger`.

New:

| Endpoint | Body | Returns |
|---|---|---|
| `POST /campaigns` | `{ imageDataUrl, name? }` (jpeg/png data URL ≤ 4 MB) | `{ ok, campaignId }` |
| `GET /campaigns/:id` | — | `Campaign` (poll every 2 s) |
| `POST /campaigns/:id/evolve` | `{ adminToken }` | `{ ok }` (next generation from the survivors) |
| `POST /campaigns/:id/room` | `{ adminToken }` | `{ ok, round }` (survivors sealed into a room round) |
| `GET /campaigns/:id/meta.csv` | — | Meta Ads Manager bulk-import CSV of survivors (stretch) |

```ts
type Ad = Variant & {                   // Variant = existing contract type (has imageUrl?)
  gen: number; parentIds: string[]; scene: string;
  fitness: { ai: Rate | null; human: Rate | null };   // Rate = existing { taps, n, rate, lo, hi }
  experiment: { impressions: number; clicks: number; ctr: number; lo: number; hi: number } | null; // simulated Meta-style delivery
  status: "screening" | "survivor" | "culled" | "winner";
};
type Generation = { gen: number; ads: Ad[]; survivorIds: string[]; sealedSha256: string | null; tokens: number; seconds: number;
  timeline: { step: number; impressionsByAd: Record<string, number> }[] };   // 20 snapshots of simulated budget flowing to winners
type Campaign = {
  id: string; name: string; createdAt: string; sourceImageUrl: string; product: Product;
  stage: "reading" | "writing" | "rendering" | "screening" | "selecting" | "done" | "error";
  progress: { label: string; done: number; total: number };   // e.g. "Rendering scenes", 5, 8
  generations: Generation[]; winnerId: string | null; error?: string;
};
```

`fixtures/campaign.json` holds a finished EPIC Snax campaign (48 gen-0 ads, 30 gen-1 ads, survivors, a
winner) so the frontend builds offline. Campaigns persist as `DATA_DIR/campaigns/<id>.json`; jobs run in-process.

## Stages (now to 17:30)

| Stage | What | When |
|---|---|---|
| T3.1 | `lib/evolve.ts`: genome, sampling for the screen, select (Wilson lower bound + lever cap), breed. Pure parts unit-tested | 14:00–15:00 |
| T3.2 | Campaign routes + in-process job runner + `fixtures/campaign.json` from a real run | 14:30–15:15 |
| T3.3 | `POST /campaigns/:id/room`: survivors → sealed room round; AI rank vs human rank in the campaign | 15:15–16:00 (room round 16:00) |
| T3.4 | Meta CSV export (stretch); README results; adversarial review | 16:00–16:45 |

Each stage runs tier 1 typecheck, tier 2 simplify, tier 3 node tests and tier 4 in a temp `DATA_DIR`.

## Guard rails (unchanged)

- The truth guard runs on all copy, and a human checks label fidelity on survivors' images.
- Every AI fitness table is sealed before people test.
- The outcome is stated tap intent from event attendees, not CTR.
- No PII.
- `ADMIN_TOKEN` must be at least 16 characters.
- Gotchas: see `CLAUDE.md`. Use port 3300, use the nvm prefix in agent shells, and kill servers by port.
