import { PANEL_SEGMENTS, Segment, type Cell, type ResultsResponse, type Scorecard, type Variant, type VariantResult } from "@hack/contract";
import type { ForecastFile, PanelSegment, VoteLine } from "../data/files";
import { mae, postStratify, spearman, wilson } from "./stats";

/** Below this many votes a rate claims nothing: no cell verdict, no winner, no MAE/Spearman input. */
const MIN_N = 10;

export type ResultsInput = {
  /** Already deduplicated on (voterId, variantId) by the store. */
  votes: readonly VoteLine[];
  variantsByRound: Readonly<Record<number, readonly Variant[] | null | undefined>>;
  forecastsByRound: Readonly<Record<number, ForecastFile | null | undefined>>;
  /** state.json opensAt: round -> ISO time. That round's earlier votes (phone tests) are not counted. */
  opensAt?: Readonly<Record<string, string>>;
  activeRound: number;
  now: Date;
};

type SegmentOf = (vote: VoteLine) => Segment;

const isPanel = (s: Segment): s is PanelSegment => (PANEL_SEGMENTS as readonly Segment[]).includes(s);

const rateOf = (votes: readonly VoteLine[]) => wilson(votes.filter((v) => v.tapped).length, votes.length);

function countBy<K extends string>(keys: Iterable<K>): Partial<Record<K, number>> {
  const counts: Partial<Record<K, number>> = {};
  for (const k of keys) counts[k] = (counts[k] ?? 0) + 1;
  return counts;
}

/** First item with the highest score, or undefined for an empty list. */
function argmax<T>(items: readonly T[], score: (item: T) => number): T | undefined {
  return items.reduce<T | undefined>((best, item) => (best === undefined || score(item) > score(best) ? item : best), undefined);
}

/** variantId -> epoch ms its round opened, for rounds with an opensAt. A malformed time throws rather than counting everything. */
function openingTimes(rounds: readonly number[], variantsByRound: ResultsInput["variantsByRound"], opensAt: Readonly<Record<string, string>>) {
  return new Map(
    rounds.flatMap((round) => {
      const iso = opensAt[String(round)];
      if (iso === undefined) return [];
      const opens = Date.parse(iso);
      if (Number.isNaN(opens)) throw new Error(`state.json opensAt["${round}"] is not an ISO time: ${iso}`);
      return (variantsByRound[round] ?? []).map((v): [string, number] => [v.id, opens]);
    }),
  );
}

function scoreRound(round: number, variants: readonly Variant[], forecast: ForecastFile | null, allVotes: readonly VoteLine[], segmentOf: SegmentOf) {
  const ids = new Set(variants.map((v) => v.id));
  const votes = allVotes.filter((v) => ids.has(v.variantId));
  // Graded on the panel segments only: the AI never modelled "other" or judges, so they get cells but no say here.
  const panel = votes.filter((v) => isPanel(segmentOf(v)));
  // The AI is graded against the room it faced: weight its panel by who voted in this round.
  const mix = countBy(new Map(panel.map((v) => [v.voterId, segmentOf(v)])).values());

  const scored = variants.map((variant) => {
    const human = rateOf(panel.filter((v) => v.variantId === variant.id));
    const probs = forecast?.perSegment[variant.id];
    const ai = probs ? postStratify(probs, mix) : null;
    const aiInsideCi = ai !== null && human.n >= MIN_N && human.lo !== null && human.hi !== null ? human.lo <= ai && ai <= human.hi : null;
    const result: VariantResult = { variantId: variant.id, round, lever: variant.lever, human, ai, aiInsideCi };
    const own = votes.filter((v) => v.variantId === variant.id);
    const cells = Segment.options.flatMap((segment): Cell[] => {
      const segVotes = own.filter((v) => segmentOf(v) === segment);
      if (segVotes.length === 0) return [];
      const cellHuman = rateOf(segVotes);
      return [{ variantId: variant.id, segment, human: cellHuman, ai: probs && isPanel(segment) ? probs[segment] : null, enough: cellHuman.n >= MIN_N }];
    });
    return { result, cells };
  });

  const results = scored.map((s) => s.result);
  const judged = results.filter((r) => r.human.n >= MIN_N);
  const humanWinner = argmax(judged, (r) => r.human.rate ?? 0);
  // The sealed pick is the AI's registered bet; the argmax of post-stratified ai drifts with the room's mix.
  const aiWinnerId = forecast?.pick ?? argmax(results.filter((r) => r.ai !== null), (r) => r.ai ?? 0)?.variantId ?? null;
  const pairs = judged.flatMap((r): [number, number][] => (r.ai !== null && r.human.rate !== null ? [[r.ai, r.human.rate]] : []));
  const scorecard: Scorecard = {
    round,
    humanWinnerId: humanWinner?.variantId ?? null,
    aiWinnerId,
    aiPickedWinner: humanWinner && aiWinnerId !== null ? humanWinner.variantId === aiWinnerId : null,
    mae: mae(pairs),
    spearman: spearman(pairs.map(([ai]) => ai), pairs.map(([, rate]) => rate)),
  };
  return { results, cells: scored.flatMap((s) => s.cells), scorecard };
}

/** Pure: the whole scoreboard from stored votes, variants and sealed forecasts. Never touches the file system. */
export function buildResults({ votes: stored, variantsByRound, forecastsByRound, opensAt = {}, activeRound, now }: ResultsInput): ResultsResponse {
  const roundNumbers = Array.from({ length: activeRound }, (_, i) => i + 1);
  const opens = openingTimes(roundNumbers, variantsByRound, opensAt);
  // Votes cast before their round opened stay on disk but never count anywhere.
  const votes = stored.filter((v) => {
    const opensMs = opens.get(v.variantId);
    return opensMs === undefined || Date.parse(v.at) >= opensMs;
  });

  // A voter belongs to the segment of their first vote, so nobody counts in two segments...
  const voterSegment = new Map<string, Segment>();
  for (const v of votes) if (!voterSegment.has(v.voterId)) voterSegment.set(v.voterId, v.segment);
  // ...but a judge-mode vote stays a judge vote, even from a phone that voted at lunch.
  const segmentOf: SegmentOf = (v) => (v.segment === "judge" ? "judge" : (voterSegment.get(v.voterId) ?? v.segment));

  const rounds = roundNumbers.flatMap((round) => {
    const variants = variantsByRound[round] ?? [];
    return variants.length > 0 ? [scoreRound(round, variants, forecastsByRound[round] ?? null, votes, segmentOf)] : [];
  });
  const mix = countBy(voterSegment.values());

  return {
    updatedAt: now.toISOString(),
    activeRound,
    voters: voterSegment.size,
    votes: votes.length,
    segmentMix: Segment.options.flatMap((segment) => {
      const voters = mix[segment] ?? 0;
      return voters > 0 ? [{ segment, voters }] : [];
    }),
    variants: rounds.flatMap((r) => r.results),
    cells: rounds.flatMap((r) => r.cells),
    seals: roundNumbers.flatMap((round) => {
      const f = forecastsByRound[round];
      return f ? [{ round: f.round, sealedAt: f.sealedAt, sha256: f.sha256, model: f.model, personasPerSegment: f.personasPerSegment }] : [];
    }),
    scorecards: rounds.map((r) => r.scorecard),
  };
}
