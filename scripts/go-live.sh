#!/usr/bin/env bash
# Live server for the room, served from a git worktree pinned to the current commit, so edits and
# agent work in this repo never touch the live stack. Votes land in THIS repo's data/ (absolute DATA_DIR).
# Usage (repo root, on the server laptop, on power): scripts/go-live.sh
# Restart: run it again (it stops the old stack first). Ctrl-C stops the tunnel only.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd)"
LIVE="$REPO/../forkcast-live"
set -a; . ./.env; set +a
export DATA_MODE=live DATA_DIR="$REPO/data"

# Kill by port, never by command line: agents run test servers with similar command lines.
for port in 3300 8787; do lsof -ti "tcp:$port" -sTCP:LISTEN | xargs kill 2>/dev/null || true; done
git worktree remove --force "$LIVE" 2>/dev/null || true
git worktree add --detach "$LIVE" HEAD
cd "$LIVE"
pnpm install --frozen-lockfile --prefer-offline
pnpm --filter web build
(pnpm --filter api start > /tmp/forkcast-api.log 2>&1 &)
(pnpm --filter web start > /tmp/forkcast-web.log 2>&1 &)

# Copy the vote log every 2 minutes while live (outside the repo).
mkdir -p "$HOME/forkcast-backups"
(while sleep 120; do cp "$DATA_DIR/votes.jsonl" "$HOME/forkcast-backups/votes-$(date +%H%M).jsonl" 2>/dev/null || true; done &)
sleep 4

echo "Live from $(git rev-parse --short HEAD). Logs: /tmp/forkcast-api.log /tmp/forkcast-web.log"
echo "When the tunnel prints https://<random>.trycloudflare.com, open ON THIS LAPTOP:"
echo "  http://localhost:3300/qr?u=<that URL>/vote                  (room QR; turnout only)"
echo "  http://localhost:3300/dashboard?admin=\$ADMIN_TOKEN         (localhost only; never on the big screen while a round is open)"
echo "If the tunnel restarts, its URL changes: reopen /qr with the new URL."
caffeinate -dims cloudflared tunnel --url http://localhost:3300
