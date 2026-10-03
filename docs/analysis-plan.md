# Forkcast analysis plan (pre-registered)

Committed before the round-1 forecast seal. Any rule changed after a round opens is logged in
`docs/decisions.md` with a reason, and results are then reported under both the old and new rule.

## Outcome

Stated tap intent: "Would tap" vs "Scroll past" on a Meta-style ad card. It is not CTR, ROAS or sales.

## Who counts

- **Graded sample:** voters who pick Student, Young professional, Parent or Into fitness (the AI
  panel's four segments). "None of these" and judges are reported separately and never graded.
- **Opening time:** each round has a published opening time (`data/state.json` `opensAt`). Earlier
  votes (phone tests) stay in `data/votes.jsonl` and are excluded.
- **Closing time:** round 1 closes when round 2 opens (or at 15:15 BST if there is no challenger).
  Round 2 closes at 16:25 BST. Later votes, including judges at the finals, are shown separately and
  never change graded results.
- **Exclusions:** team members do not vote. A repeated (voter, ad) pair counts once. Votes decided
  in under 300 ms are excluded as too fast to have read the ad.

## Exposure

Every voter sees every ad of the open round once, in a per-voter random order seeded by their
anonymous id, so each card's position can be reconstructed for a fatigue check (tap rate by position).

## Statistics (fixed before any data)

- **Tap rate per ad:** taps / n with a 90% Wilson interval. 90% suits a small-sample read; the level
  is printed wherever an interval appears.
- **Winner rule:** the top ad is called the winner only if a paired within-voter comparison with the
  runner-up separates them: difference in tap rate from discordant pairs (McNemar-style), with a 90%
  interval that excludes zero. Otherwise we report a tied top group: every ad not separated from the
  top ad by the same paired test.
- **AI winner hit:** the AI's sealed pick (equal segment weights, fixed at seal time) is in the top
  group. Chance rate: (top group size) / 6.
- **AI error:** mean absolute error between the AI forecast (post-stratified to the graded sample's
  segment mix) and human tap rates, over ads with n ≥ 10. Reported with a 90% bootstrap interval
  (2,000 resamples of voters) and next to the expected error of a perfect forecaster at the observed
  n, which is pure sampling noise.
- **Rank agreement:** Spearman over round-1 ads is descriptive only; it is not reported for round 2.
- **Segments:** a segment claim needs n ≥ 10 in that cell and passes the same paired rule within the segment.
- **Trust map:** per lever (and per segment with n ≥ 10), the AI-minus-human gap with its interval.
  "Trust the AI here" means the interval includes zero and is narrower than ±15 points.

## Round 2 (challenger)

- Challengers keep the round-1 winner's lever. Round 2 shows the incumbent (the round-1 winner's copy,
  unchanged) and two challengers.
- Test: paired within-voter difference, challenger minus incumbent, with a 90% interval. Fewer than
  20 completers means "inconclusive". Returning and first-time voters are pooled; this is a stated limitation.
- Round 2 opens only after its forecast seal is pushed to GitHub.

## Pre-registration evidence

The forecast file's sha256 (over canonical JSON) and GitHub's server-side push time for the seal
commit (the repository's Activity view) must both precede the first graded vote's timestamp.
