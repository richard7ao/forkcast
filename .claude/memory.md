## Decisions

- [2026-10-03] Pitch is "generation is free, validation is scarce": a sealed AI persona forecast graded by real attendee votes. Hero metric is forecast error, not "votes saved" (no baseline).
- [2026-10-03] Approach C (room test then challenger loop) over adaptive allocation: ~60 voters is too thin for 24+ arms. Cut the challenger if the dashboard is not live on real data by 15:15.
- [2026-10-03] 6 lever variants on 1 product photo with within-subjects exposure (every voter sees all 6), so per-variant n = voter count. Declined Codex's 3-message shrink for that reason.
- [2026-10-03] Declined SurveyJS (Codex suggestion): the two-button vote card is ~50 lines and avoids a dependency and a styling fight.
- [2026-10-03] Scaffold by copying the /hackathon template into the repo root; init.sh refuses a non-empty dir and would nest a git repo.
- [2026-10-03] Live server is `next build` + `next start` + a cloudflared quick tunnel on the backend laptop. No deployment.

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

## Open Questions

- [2026-10-03] Which Shelf product; public GitHub repo creation needs Richard's OK; organisers' mic slot at 14:00; venue Wi-Fi with the tunnel.
- [2026-10-03] UI direction pending pick: v2 canvas https://claude.ai/artifact/27bRsusa3uxU7LdW8pU7qw has A Gimme native, B Sealed lab, C Match night, D Really Good, and E = A + D all light (recommended; user disliked D's dark sections). Each row: upload, campaign + drawer, winner + analytics, member swipe phone. AdCard is the stimulus: identical in every direction, never restyled.
