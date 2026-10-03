import type { Ad, Campaign } from "@hack/contract";

/** Drag distance, in px, that counts as a swipe. Shorter drags snap back: a tap on the card is not a vote. */
export const SWIPE_PX = 80;

/** Real swipes per ad id: taps = swiped right, n = swiped either way. */
export type Tally = Readonly<Record<string, { taps: number; n: number }>>;

/** The last generation's survivors and winner. The AI screen narrows the field; members judge only these. */
export function finalists(campaign: Campaign): Ad[] {
  const last = campaign.generations.at(-1);
  return last ? last.ads.filter((ad) => ad.status === "survivor" || ad.status === "winner") : [];
}

export function swipeDirection(dx: number): "right" | "left" | null {
  if (dx >= SWIPE_PX) return "right";
  if (dx <= -SWIPE_PX) return "left";
  return null;
}

/** A new tally with one more swipe on adId. Never mutates: it is React state. */
export function record(tally: Tally, adId: string, tapped: boolean): Tally {
  const prev = tally[adId] ?? { taps: 0, n: 0 };
  return { ...tally, [adId]: { taps: prev.taps + (tapped ? 1 : 0), n: prev.n + 1 } };
}

/**
 * The members' pick: highest posterior mean (taps + 1) / (n + 2), the rule the engine selects with, so one
 * lucky tap cannot outrank a well-tested ad. null before any swipe, and on a tie: a coin flip is not a verdict.
 */
export function humanLeader(ads: readonly Ad[], tally: Tally): Ad | null {
  if (Object.keys(tally).length === 0) return null;
  const score = (ad: Ad) => {
    const t = tally[ad.id];
    return t ? (t.taps + 1) / (t.n + 2) : 0.5;
  };
  const [first, second] = [...ads].sort((a, b) => score(b) - score(a));
  if (!first || (second && score(second) === score(first))) return null;
  return first;
}
