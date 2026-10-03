#!/usr/bin/env bash
# Move the live worktree to the current commit and restart API + web, leaving the cloudflared
# tunnel (and so the QR URL) untouched. Run only OUTSIDE voting windows: ~1 min of downtime.
# Usage (repo root): scripts/redeploy-live.sh
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="$(pwd)"
LIVE="$REPO/../forkcast-live"
test -d "$LIVE" || { echo "no live worktree: run scripts/go-live.sh first" >&2; exit 1; }
set -a; . ./.env; set +a
export DATA_MODE=live DATA_DIR="$REPO/data"

git -C "$LIVE" checkout -q --detach "$(git rev-parse HEAD)"
cd "$LIVE"
pnpm install --frozen-lockfile --prefer-offline
# Kill by port, never by command line: agents run test servers with similar command lines.
for port in 3300 8787; do lsof -ti "tcp:$port" -sTCP:LISTEN | xargs kill 2>/dev/null || true; done
pnpm --filter web build
(pnpm --filter api start > /tmp/forkcast-api.log 2>&1 &)
(pnpm --filter web start > /tmp/forkcast-web.log 2>&1 &)
sleep 4
echo "live now at $(git rev-parse --short HEAD); tunnel untouched"
