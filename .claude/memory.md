## Decisions

- [2026-10-03] Pitch is "generation is free, validation is scarce": a sealed AI persona forecast graded by real attendee votes. Hero metric is forecast error, not "votes saved" (no baseline).
- [2026-10-03] Approach C (room test then challenger loop) over adaptive allocation: ~60 voters is too thin for 24+ arms. Cut the challenger if the dashboard is not live on real data by 15:15.
- [2026-10-03] 6 lever variants on 1 product photo with within-subjects exposure (every voter sees all 6), so per-variant n = voter count. Declined Codex's 3-message shrink for that reason.
- [2026-10-03] Declined SurveyJS (Codex suggestion): the two-button vote card is ~50 lines and avoids a dependency and a styling fight.
- [2026-10-03] Scaffold by copying the /hackathon template into the repo root; init.sh refuses a non-empty dir and would nest a git repo.
- [2026-10-03] Live server is `next build` + `next start` + a cloudflared quick tunnel on the backend laptop. No deployment.

- [2026-10-03] UI direction E (A Gimme native + D Really Good, all light) is built (334614c, 1f44097). The light theme is scoped to `.theme-e` so /vote-lite and /watch-humans keep their look.
- [2026-10-03] Campaign pages reuse vote-lite's AdCard unchanged (the stimulus people voted on), framed by a ring outside the card, instead of the mockups' square-image card.
- [2026-10-03] Upload limit follows the contract (data URL max 8.4M chars, about 6 MB of image), not frontend.md's "≤ 4 MB".
- [2026-10-03] "Test with real people" admin button not built: POST /campaigns/:id/room is in neither the contract nor the API.
- [2026-10-03] The segment heatmap shows GET /results as the room test, named by GET /variants' product, because those rows are not the campaign's ads.

## Patterns

- [2026-10-03] Shared API contract lives verbatim in both specs (docs/superpowers/specs/backend.md, frontend.md), spliced by script and checked with `tsc --strict` before hand-off.
- [2026-10-03] Render reuse (demo path): the cache is the finished campaigns themselves, matched on the sha256 of the uploaded photo (lib/renderCache.ts). No cache files to keep in sync; new runs become reusable automatically.
- [2026-10-03] Test every flow in the /lab page on the local test-ui branch (../forkcast-testui, API :8788 with its own DATA_DIR, web :3302 live mode); copy changed API files in, or merge master.

## Gotchas

- [2026-10-03] Agent Bash shells define node/pnpm as snapshot functions calling a missing `_load_nvm`. Use `unset -f node npm npx pnpm; . ~/.nvm/nvm.sh` (gives Node v22.13.1).
- [2026-10-03] Neither tsx nor Next reads the root .env. Export it with `set -a; . ./.env; set +a`.
- [2026-10-03] Only OPENAI_API_KEY exists; all AI calls use OpenAI via apps/api/src/lib/llm.ts (gpt-6.1-sol ~4s, gpt-5.4-mini ~1s, gpt-image-2).
- [2026-10-03] Never `cp` over .env: the scaffold's `cp .env.example .env` wiped a user-added key. Append or edit in place.
- [2026-10-03] zsh: a shell variable named `path` overwrites PATH and every later command fails with "command not found".
- [2026-10-03] Port 3000 on Richard's Mac is held by the Nous Vite dev server; Forkcast web runs on 3300.
- [2026-10-03] context-mode hook blocks curl/inline fetch in Bash; test HTTP with a node script file or ctx_execute.
- [2026-10-03] The Playwright MCP browser can be locked by another session ("Browser is already in use"); use the chrome-devtools MCP with `isolatedContext` and `background: true` so a tab the user is clicking in is left alone.
- [2026-10-03] With parallel agents, a file can appear between your check and your Write: check `git status` right before writing a path a teammate might create (a route test was overwritten this way).
- [2026-10-03] Uploaded campaign photos land in `apps/web/public/generated/campaigns/<id>/source.*` and may show people; that pattern is gitignored, so commit only the renders and a checked crop.
- [2026-10-03] `node --test` treats a path argument as a glob, so `[id]` folders match nothing and it reports 0 tests without failing. Run such files directly: `node --import tsx "<path>"`.
- [2026-10-03] `next start` serves only the public/ files present when it booted. Images written later (live campaign renders) need the route handler at `apps/web/src/app/generated/campaigns/[id]/[file]/route.ts`.
- [2026-10-03] Production is the live stack behind the cloudflared tunnel (scripts/go-live.sh, redeploy-live.sh); there is no Vercel or GitHub deployment.
- [2026-10-03] Gen N+1 carries gen-N survivors forward under the same ad id, re-screened with their own fitness and status, and their `gen` field keeps the birth generation. Ad ids are unique only within a generation: look ads up by (generation, id) with `findAd` in apps/web/src/app/campaigns/[id]/format.ts.
- [2026-10-03] Survivors are selected by posterior simulated CTR, (clicks+1)/(impressions+2), not by AI P(tap); a culled ad can out-score the winner on AI P(tap).
- [2026-10-03] The live web (:3300) and API (:8787) run from a separate checkout, ~/Documents/GitHub/forkcast-live. A fixture dev server on :3301 runs from this repo and shares apps/web/.next, so run `next build` in a scratch copy (symlinked node_modules and packages), not in place.
- [2026-10-03] Next injects a route announcer with role="alert"; scope Playwright alert locators, e.g. `form [role=alert]`.
- [2026-10-03] The admin token is read once from ?admin=, kept in sessionStorage (key fk-admin) and stripped from the URL, so it never shows on the demo screen.

## Open Questions

- [2026-10-03] Which Shelf product; public GitHub repo creation needs Richard's OK; organisers' mic slot at 14:00; venue Wi-Fi with the tunnel.
- [2026-10-03] /watch-humans still uses the old dark tokens; direction E's swipe mockup (canvas row E, https://claude.ai/artifact/27bRsusa3uxU7LdW8pU7qw) is not applied to it, because it is a stimulus page people test on.
