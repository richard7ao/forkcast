#!/usr/bin/env bash
# Open round N for voting: activeRound = N and opensAt[N] = now in data/state.json, then commit and push.
# Refuses unless round N's sealed forecast is already on origin/master (pre-registration first).
# Votes cast before opensAt[N] (phone tests) stay in data/votes.jsonl and are excluded from results.
set -euo pipefail
cd "$(dirname "$0")/.."
ROUND="${1:?usage: scripts/open-round.sh <round>}"
SEAL="data/forecasts/round-$ROUND.json"
test -f "$SEAL" || { echo "round $ROUND has no sealed forecast ($SEAL)" >&2; exit 1; }
git fetch -q origin
SEAL_COMMIT="$(git log -1 --format=%H -- "$SEAL")"
[ -n "$SEAL_COMMIT" ] && git merge-base --is-ancestor "$SEAL_COMMIT" origin/master \
  || { echo "round $ROUND seal is not pushed to origin/master yet: run scripts/seal-round.sh first" >&2; exit 1; }

node -e '
const fs = require("fs");
const p = "data/state.json";
const round = process.argv[1];
const prev = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : { activeRound: 1 };
const next = { ...prev, activeRound: Number(round), opensAt: { ...prev.opensAt, [round]: new Date().toISOString() } };
fs.writeFileSync(p, JSON.stringify(next, null, 2) + "\n");
console.log(`opened round ${round} at ${next.opensAt[round]}`);
' "$ROUND"
git add data/state.json
git commit -qm "data: open round $ROUND"
for i in 1 2 3 4 5; do git push -q && exit 0; sleep 5; done
echo "PUSH FAILED (round is open locally): run git push when the network is back" >&2
