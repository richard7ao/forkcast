# Forkcast (EAT_HACK, 3 Oct 2026)

Sealed AI forecasts for food ads, graded by real people at the event. Two people, two lanes:

- Backend lane: follow `docs/superpowers/specs/backend.md`
- Frontend lane: follow `docs/superpowers/specs/frontend.md`
- Design record: `docs/designs/forkcast.md`

If you don't know which lane you are, ask the human at session start. Stay inside your lane's
directories (see `AGENTS.md`).

## Commands

- Install: `pnpm install --frozen-lockfile`
- Dev, fixture mode (default, no backend needed): `pnpm dev` (web :3300, api :8787)
- Live mode: `set -a; . ./.env; set +a; DATA_MODE=live pnpm dev`
- Before every push: `pnpm check` (fixtures:validate + typecheck)
- Backend tests: `pnpm test`

## Gotchas

- Agent shells on Richard's Mac: run `unset -f node npm npx pnpm 2>/dev/null; . ~/.nvm/nvm.sh` first.
- tsx and Next do not read the root `.env`. Export it with `set -a; . ./.env; set +a`.
- In zsh, never name a shell variable `path`: it is tied to `PATH` and breaks every later command.
- Never copy or write over `.env`. It holds API keys that exist nowhere else. Append or edit in place.

## Project-Specific Constraints (ABSOLUTE — no exceptions)

| Rule | Reason |
| --- | --- |
| `packages/contract` is frozen: add optional fields only, and update both specs | Both lanes build against it in parallel |
| Never edit the seam files: `apps/web/src/lib/client.ts`, `apps/web/src/lib/useEndpoint.ts`, `apps/web/src/app/api/[...path]/route.ts`, `packages/contract/src/fixtures.ts`, `apps/api/src/index.ts` | They keep the lanes decoupled |
| Only touch your lane's paths, and `git add` only those paths | Both lanes push to `master`; disjoint paths mean no merge conflicts |
| `pnpm check` must be green before every push; use `git pull --rebase` | A red `master` blocks the other person |
| Ad copy may only use `product.facts`: no invented numbers, reviews or awards | Real brand, real people voting |
| Seal and push a round's AI forecast before that round's first vote | Pre-registration is the core claim |
| Store no PII; never commit `.env`, keys or `sample_images/` | The repo is public |
