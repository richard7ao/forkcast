# Forkcast Frontend — Spec (v2: evolution)

> For the frontend person and their Claude Code. The backend works from `backend.md`. The "Product"
> and "API" sections are identical in both files. Build against `fixtures/campaign.json` in fixture
> mode; you never wait for the backend. A paste-ready prompt is in `docs/frontend-prompt.md`.

## Product (identical in both specs)

**Forkcast is survival of the fittest for ads.**

1. A brand uploads one image: an existing marketing image or a product photo.
2. Forkcast reads the pack (vision), so ad copy can only claim what the pack says.
3. It generates ~50 Meta-style ad variants: 8 AI scenes × 6 behavioural copy levers = 48 ads,
   all rendered from the one image.
4. It runs experiments. An **AI shopper panel** gives fast simulated fitness, and **real people**
   give ground truth (the event room now, Meta ads later).
5. Only the fittest survive. Survivors **breed**: copy and scene mutations of the winners.
   Repeat until one ad holds the top spot.
6. The winner ships to Meta Ads (CSV export today, Marketing API later).

**Written up, not built today:**
- **Meta Marketing API:** real CTR becomes the fitness signal.
- **Shopify:** the same loop on product-page photos, with add-to-cart as fitness.

Every AI verdict is sealed (sha256) before people test, so the AI is graded rather than trusted.

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
  status: "screening" | "survivor" | "culled" | "winner";
};
type Generation = { gen: number; ads: Ad[]; survivorIds: string[]; sealedSha256: string | null; tokens: number; seconds: number };
type Campaign = {
  id: string; name: string; createdAt: string; sourceImageUrl: string; product: Product;
  stage: "reading" | "writing" | "rendering" | "screening" | "selecting" | "done" | "error";
  progress: { label: string; done: number; total: number };   // e.g. "Rendering scenes", 5, 8
  generations: Generation[]; winnerId: string | null; error?: string;
};
```

`fixtures/campaign.json` holds a finished EPIC Snax campaign (48 gen-0 ads, 30 gen-1 ads, survivors, a
winner) so the frontend builds offline. Campaigns persist as `DATA_DIR/campaigns/<id>.json`; jobs run in-process.

## Screens

The QR page is not product UI: the room's QR goes on a slide.

1. **`/` New campaign (brand dashboard):**
   - Drag-and-drop or pick one image (a marketing image or product photo), add a name, then **Run**.
   - Convert the image to a data URL and send `POST /campaigns`, then route to `/campaigns/[id]`.
2. **`/campaigns/[id]` Live campaign (the hero screen):**
   - **Header:** the uploaded image plus the pack facts Forkcast read (chips), so the user sees what copy may claim.
   - **Generation rail:** `Gen 0: 48 ads → 6 survive → Gen 1: 30 ads → 6 survive → Winner`.
     Clicking a generation shows its grid.
   - **Progress while running:** `stage` + `progress` ("Rendering scenes 5/8", "Screening with 40 AI shoppers 23/40").
   - **Ad grid:** Meta-feed-style cards, 4–6 per row.
     - Each card has a fitness bar: AI P(tap) with its interval, plus human tap rate once tested.
     - Status badge: survivor, culled (faded) or winner.
     - Click a card for its lineage (parents → children) and evidence (n, interval, sealed sha).
   - **Admin buttons:** **Evolve** (next generation) and **Test with real people** (room round).
     They appear only when `?admin=<token>` is in the URL.
   - **Winner panel:** the winning ad, its family tree, AI vs human result, and **Export to Meta** (`meta.csv`).
   - **Analytics tab:**
     - Which levers survive across generations, and which scenes survive.
     - AI rank vs human rank for the tested survivors.
     - By-segment heatmap from `GET /results` (show "insufficient evidence" when n < 10).
3. **`/vote-lite` (exists, backend-built):** the phone page people use in the room. Don't restyle the
   ad card: it's the stimulus.

## Rules

- **Ad cards:** one shared `AdCard` component, identical in every screen. Show "Concept test, not a real ad" small.
- **Numbers:** the API sends full precision; format as `%` with intervals ("66% (54–76)") and always show n.
- **No live results to the room while a round is open:** the dashboard is for the brand, not the room.
- **Toolkit:** Tailwind v4, Recharts, and the template's `fetchTyped`/`useEndpoint` seams. Add no UI library.
- **Before every push:** run `pnpm check` and stay green.

## Stages

| Stage | What | When |
|---|---|---|
| T4.1 | `/` upload flow + `/campaigns/[id]` grid and rail against the fixture | now–15:00 |
| T4.2 | Progress states, lineage drawer, winner panel, Meta export button | 15:00–15:45 |
| T4.3 | Analytics tab (levers, scenes, AI vs human, segments) | 15:45–16:30 |
| T4.4 | Freeze 16:45, then the ≤2-minute video (script in `docs/pitch.md`), then submit by 17:25 | 16:45–17:25 |
