## Decisions

- [2026-10-03] Pitch is "generation is free, validation is scarce": a sealed AI persona forecast graded by real attendee votes. Hero metric is forecast error, not "votes saved" (no baseline).
- [2026-10-03] Approach C (room test then challenger loop) over adaptive allocation: ~60 voters is too thin for 24+ arms. Cut the challenger if the dashboard is not live on real data by 15:15.
- [2026-10-03] 6 lever variants on 1 product photo with within-subjects exposure (every voter sees all 6), so per-variant n = voter count. Declined Codex's 3-message shrink for that reason.
- [2026-10-03] Declined SurveyJS (Codex suggestion): the two-button vote card is ~50 lines and avoids a dependency and a styling fight.
- [2026-10-03] Scaffold by copying the /hackathon template into the repo root; init.sh refuses a non-empty dir and would nest a git repo.
- [2026-10-03] Live server is `next build` + `next start` + a cloudflared quick tunnel on the backend laptop. No deployment.

## Patterns

- [2026-10-03] Shared API contract lives verbatim in both specs (docs/superpowers/specs/backend.md, frontend.md), spliced by script and checked with `tsc --strict` before hand-off.

## Gotchas

- [2026-10-03] Agent Bash shells define node/pnpm as snapshot functions calling a missing `_load_nvm`. Use `unset -f node npm npx pnpm; . ~/.nvm/nvm.sh` (gives Node v22.13.1).
- [2026-10-03] Neither tsx nor Next reads the root .env. Export it with `set -a; . ./.env; set +a`.
- [2026-10-03] Only OPENAI_API_KEY exists; all AI calls use OpenAI via apps/api/src/lib/llm.ts (gpt-6.1-sol ~4s, gpt-5.4-mini ~1s, gpt-image-2).
- [2026-10-03] Never `cp` over .env: the scaffold's `cp .env.example .env` wiped a user-added key. Append or edit in place.
- [2026-10-03] zsh: a shell variable named `path` overwrites PATH and every later command fails with "command not found".
- [2026-10-03] Port 3000 on Richard's Mac is held by the Nous Vite dev server; Forkcast web runs on 3300.
- [2026-10-03] context-mode hook blocks curl/inline fetch in Bash; test HTTP with a node script file or ctx_execute.

## Open Questions

- [2026-10-03] Which Shelf product; public GitHub repo creation needs Richard's OK; organisers' mic slot at 14:00; venue Wi-Fi with the tunnel.
