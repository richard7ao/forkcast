#!/usr/bin/env bash
# Seal ritual: forecast round N, verify its hash, commit and push it BEFORE the round's first vote.
# Usage: scripts/seal-round.sh 1 [--no-generate]   (round 1 generates the 6 lever ads first)
# Round 2 is generated and sealed by POST /challenger; run `scripts/seal-round.sh 2 --commit-only` after it.
set -euo pipefail
cd "$(dirname "$0")/.."
ROUND="${1:?usage: scripts/seal-round.sh <round> [--no-generate|--commit-only]}"
MODE="${2:-}"
set -a; . ./.env; set +a

if [ "$MODE" != "--commit-only" ]; then
  if [ "$ROUND" = "1" ] && [ "$MODE" != "--no-generate" ]; then
    (cd apps/api && node --import tsx scripts/generate.ts --round 1)
  fi
  (cd apps/api && node --import tsx scripts/forecast.ts --round "$ROUND" ${FORCE:+--force})
fi
(cd apps/api && node --import tsx scripts/verify-seal.ts --round "$ROUND")

git add data/product.json data/variants data/forecasts data/personas.json
git add docs/analysis-plan.md docs/decisions.md
[ -f data/state.json ] && git add data/state.json
[ -f data/generated.json ] && git add data/generated.json
for img in apps/web/public/generated/r"$ROUND"-*.png; do [ -f "$img" ] && git add "$img"; done
git commit -m "data: seal round-$ROUND forecast"
for i in 1 2 3 4 5; do git push && { git log -1 --format="sealed commit %h at %cI"; exit 0; }; sleep 5; done
echo "PUSH FAILED: run git push manually before the first vote" >&2
exit 1
