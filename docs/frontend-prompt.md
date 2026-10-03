# Paste-ready prompt for the frontend Claude session

Copy everything below the line into the frontend teammate's Claude Code (run from the repo root).

---

You are the frontend engineer on Forkcast, a hackathon app (EAT_HACK, Really Good Culture, London;
submission at 17:30 today). Read `CLAUDE.md`, `AGENTS.md` and `docs/superpowers/specs/frontend.md`
first. That spec is your task list.

**Product:** survival of the fittest for ads.
1. A brand uploads ONE image (an existing marketing image or a product photo).
2. Forkcast generates ~48 Meta-style ad variants: 8 AI-rendered scenes × 6 behavioural copy levers.
3. Experiments run: an AI shopper panel first, then real people.
4. Only the fittest survive. Survivors breed new variants; repeat until a winner.
5. Export the winner to Meta.

Shopify product-photo optimisation is a future integration: mention it in one empty-state line only.

**Build, in Next.js 15 (app router) + Tailwind v4 in `apps/web`:**

1. **`/`:** a single, confident upload screen. Drag-and-drop or pick an image, an optional campaign
   name, and a Run button. Read the file as a data URL, `POST /api/campaigns`, then route to `/campaigns/[id]`.
2. **`/campaigns/[id]`:** poll `GET /api/campaigns/:id` every 2 s. Show:
   - **Header:** the uploaded image plus the pack-fact chips (`campaign.product.facts`).
   - **Generation rail:** "Gen 0 · 48 ads → 6 survive → Gen 1 · 30 ads → 6 survive → Winner"; clicking a step shows that grid.
   - **Running state:** `stage` + `progress` as a labelled progress bar.
   - **Ad grid:** Meta-feed-style cards, 4–6 per row. Each shows `imageUrl`, headline, body and CTA, a fitness bar
     (`fitness.ai` rate with lo–hi interval, plus `fitness.human` once present, each with n) and a status badge
     (survivor, culled faded, winner).
   - **Click a card:** a drawer with its lineage (`parentIds`), lever, scene and evidence.
   - **Admin buttons (only with `?admin=<token>`):** "Evolve" → `POST /api/campaigns/:id/evolve`, and
     "Test with real people" → `POST /api/campaigns/:id/room`, each with `{ adminToken }`.
   - **Winner panel:** the winning ad, its family tree, AI vs human, and "Export to Meta" (link to `/api/campaigns/:id/meta.csv`).
   - **Analytics tab (Recharts):** lever survival across generations, scene survival, AI rank vs human rank
     scatter, and a segment heatmap from `GET /api/results` (n < 10 = "insufficient evidence").

**Data:** use the contract types in `packages/contract` (fetch through `apps/web/src/lib/client.ts`
`fetchTyped` / `useEndpoint`; never edit those files or the proxy route). In fixture mode (the default),
`fixtures/campaign.json` is served, so build everything now without the backend. If the campaign
endpoints aren't in the contract yet, the backend is adding them. Code against the shapes in the spec's
API section and tell the backend person about any field you need.

**Design:**
- Bold, modern, brand-tool feel.
- The ad cards are the stimulus: one shared `AdCard`, identical everywhere, styled like a real Meta
  feed ad with a small "Concept test, not a real ad".
- Format numbers as `66% (54–76) · n 47`.
- No QR codes in the product UI.
- Mobile-friendly, accessible (labels, focus states, contrast).

**Done when:** `pnpm check` is green, `pnpm --filter web build` passes, both pages render the fixture,
and the upload → campaign navigation works in fixture mode. Commit only `apps/web/**` paths
(`git add apps/web`), then `git pull --rebase && git push`.
