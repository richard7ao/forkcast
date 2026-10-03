/**
 * Mocked Watch Humans audience data for /watch-humans/analytics. Nothing here is measured. A panel of synthetic
 * members, seeded from the campaign id (mulberry32), swipes the campaign's real finalists, and every figure on the
 * page is counted from that one panel, so totals, shares and cross-tabs always agree and a reload shows the same
 * numbers. ponytail: swap simulatePanel for Watch Humans' real member records; the aggregation stays as it is.
 */
import type { Campaign } from "@hack/contract";
import { hashString } from "../vote-lite/lite";
import { finalists } from "./swipe";

export const AGES = ["18–24", "25–34", "35–44", "45–54", "55+"] as const;
export const GENDERS = ["Female", "Male", "Non-binary", "Prefer not to say"] as const;
export const REGIONS = ["London", "South East", "North West", "Midlands", "Scotland", "Wales", "Other regions"] as const;
export const HOUSEHOLDS = ["Students", "Young professionals", "Parents with kids", "Couples"] as const;
export const DIETS = ["No preference", "High-protein", "Vegetarian", "Low-sugar", "Gluten-free"] as const;
export const SHOPPING = ["Daily", "2–3 times a week", "Weekly", "Fortnightly or less"] as const;
export const STORES = ["Tesco", "Sainsbury's", "Aldi", "Ocado", "Waitrose"] as const;
export const DEVICES = ["iOS", "Android"] as const;
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const HOURS = 24;

// Base mixes, jittered per campaign. Household depends on age band (rows follow AGES): next to no 55+ students.
const AGE_MIX = [0.22, 0.34, 0.2, 0.14, 0.1];
const GENDER_MIX = [0.57, 0.39, 0.025, 0.015];
const REGION_MIX = [0.24, 0.16, 0.12, 0.14, 0.09, 0.05, 0.2];
const DIET_MIX = [0.38, 0.2, 0.17, 0.14, 0.11];
const SHOPPING_MIX = [0.12, 0.38, 0.36, 0.14];
const STORE_MIX = [0.31, 0.22, 0.17, 0.14, 0.16];
const DEVICE_MIX = [0.58, 0.42];
const HOUSEHOLD_BY_AGE = [
  [0.6, 0.3, 0.03, 0.07],
  [0.08, 0.5, 0.17, 0.25],
  [0.02, 0.2, 0.5, 0.28],
  [0.01, 0.1, 0.5, 0.39],
  [0.01, 0.04, 0.2, 0.75],
];
const DAY_MIX = [0.12, 0.13, 0.14, 0.14, 0.15, 0.17, 0.15];
// Commute, lunch and a big evening peak.
const HOUR_MIX = [0.9, 0.5, 0.3, 0.2, 0.2, 0.4, 1.2, 2.6, 3.2, 2.2, 1.8, 2.2, 3.4, 3, 2, 1.8, 2, 2.6, 3.4, 4.6, 5.2, 4.8, 3.4, 1.8];
const PARENTS = HOUSEHOLDS.indexOf("Parents with kids");
/** Smallest segment an insight may quote: fewer members is noise. */
const MIN_SEGMENT = 30;

export type Share = { label: string; count: number; pct: number };
export type FinalistStat = { id: string; headline: string; imageUrl: string; aiWinner: boolean; rights: number; rate: number };
export type Insight = { title: string; body: string };
export type Analytics = {
  members: number;
  swipes: number;
  rights: number;
  samples: number;
  videos: number;
  watchSec: number;
  age: Share[];
  gender: Share[];
  region: Share[];
  household: Share[];
  diet: Share[];
  shopping: Share[];
  store: Share[];
  device: Share[];
  finalists: FinalistStat[];
  /** Right-swipe rate, 0–1, per [finalist][age band] and per [finalist][gender]. */
  byAge: number[][];
  byGender: number[][];
  /** Swipes per [day][hour]. */
  when: number[][];
  insights: Insight[];
};

type Member = {
  age: number;
  gender: number;
  household: number;
  region: number;
  diet: number;
  shopping: number;
  store: number;
  device: number;
  day: number;
  hour: number;
  right: boolean[];
  claimed: boolean;
  filmed: boolean;
};

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Largest-remainder rounding: whole numbers in proportion to `weights` that sum to exactly `total`. */
export function apportion(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const quotas = weights.map((w) => (w / sum) * total);
  const floors = quotas.map((q) => Math.floor(q));
  const left = total - floors.reduce((a, b) => a + b, 0);
  const bumped = new Set(
    quotas.map((q, i) => ({ i, rem: q - Math.floor(q) })).sort((x, y) => y.rem - x.rem).slice(0, left).map((x) => x.i),
  );
  return floors.map((n, i) => (bumped.has(i) ? n + 1 : n));
}

function pick(rand: () => number, weights: readonly number[]): number {
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

const jitter = (rand: () => number, weights: readonly number[]) => weights.map((w) => w * (0.8 + 0.4 * rand()));
const lean = (rand: () => number, n: number) => Array.from({ length: n }, () => (rand() - 0.5) * 0.24);
const ratio = (part: number, whole: number) => (whole ? part / whole : 0);
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const best = <T>(items: readonly T[], score: (t: T) => number): T | undefined =>
  items.reduce<T | undefined>((b, t) => (b === undefined || score(t) > score(b) ? t : b), undefined);
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const clock = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;

function simulatePanel(rand: () => number, ads: number): Member[] {
  const members = 1100 + Math.floor(rand() * 200);
  const age = jitter(rand, AGE_MIX);
  const gender = jitter(rand, GENDER_MIX);
  const region = jitter(rand, REGION_MIX);
  const diet = jitter(rand, DIET_MIX);
  const shopping = jitter(rand, SHOPPING_MIX);
  const store = jitter(rand, STORE_MIX);
  const device = jitter(rand, DEVICE_MIX);
  // Each finalist: a base chance of a right swipe, plus a lean per age band, gender and household.
  const appeal = Array.from({ length: ads }, () => ({
    base: 0.34 + rand() * 0.26,
    age: lean(rand, AGES.length),
    gender: lean(rand, GENDERS.length),
    household: lean(rand, HOUSEHOLDS.length),
  }));
  const claimRate = 0.9 + rand() * 0.07;
  const filmRate = 0.3 + rand() * 0.15;
  return Array.from({ length: members }, () => {
    const a = pick(rand, age);
    const g = pick(rand, gender);
    const h = pick(rand, HOUSEHOLD_BY_AGE[a] ?? []);
    const claimed = rand() < claimRate;
    return {
      age: a,
      gender: g,
      household: h,
      region: pick(rand, region),
      diet: pick(rand, diet),
      shopping: pick(rand, shopping),
      store: pick(rand, store),
      device: pick(rand, device),
      day: pick(rand, DAY_MIX),
      hour: pick(rand, HOUR_MIX),
      right: appeal.map((p) => {
        const chance = p.base + (p.age[a] ?? 0) + (p.gender[g] ?? 0) + (p.household[h] ?? 0);
        return rand() < Math.min(0.92, Math.max(0.06, chance));
      }),
      claimed,
      filmed: claimed && rand() < filmRate,
    };
  });
}

/** Every number on /watch-humans/analytics for one campaign. Same campaign id, same numbers. */
export function buildAnalytics(campaign: Campaign): Analytics {
  const ads = finalists(campaign);
  const rand = mulberry32(hashString(campaign.id));
  const panel = simulatePanel(rand, ads.length);
  const watchSec = 34 + Math.floor(rand() * 22);
  const members = panel.length;
  const count = (keep: (m: Member) => boolean, from: readonly Member[] = panel) => from.filter(keep).length;
  const shares = (labels: readonly string[], key: (m: Member) => number): Share[] => {
    const counts = labels.map((_, i) => count((m) => key(m) === i));
    const pcts = apportion(100, counts);
    return labels.map((label, i) => ({ label, count: counts[i] ?? 0, pct: pcts[i] ?? 0 }));
  };
  const rateIn = (f: number, keep: (m: Member) => boolean) => {
    const seg = panel.filter(keep);
    return ratio(count((m) => m.right[f] === true, seg), seg.length);
  };

  const stats = ads.map((ad, f) => {
    const rights = count((m) => m.right[f] === true);
    return {
      id: ad.id,
      headline: ad.headline,
      imageUrl: ad.imageUrl ?? campaign.product.imageUrl,
      aiWinner: ad.id === campaign.winnerId,
      rights,
      rate: ratio(rights, members),
    };
  });
  const byAge = ads.map((_, f) => AGES.map((_, a) => rateIn(f, (m) => m.age === a)));
  const byGender = ads.map((_, f) => GENDERS.map((_, g) => rateIn(f, (m) => m.gender === g)));
  const when = DAYS.map((_, d) =>
    Array.from({ length: HOURS }, (_, h) => count((m) => m.day === d && m.hour === h) * ads.length),
  );

  return {
    members,
    swipes: members * ads.length,
    rights: sum(stats.map((s) => s.rights)),
    samples: count((m) => m.claimed),
    videos: count((m) => m.filmed),
    watchSec,
    age: shares(AGES, (m) => m.age),
    gender: shares(GENDERS, (m) => m.gender),
    region: shares(REGIONS, (m) => m.region),
    household: shares(HOUSEHOLDS, (m) => m.household),
    diet: shares(DIETS, (m) => m.diet),
    shopping: shares(SHOPPING, (m) => m.shopping),
    store: shares(STORES, (m) => m.store),
    device: shares(DEVICES, (m) => m.device),
    finalists: stats,
    byAge,
    byGender,
    when,
    insights: findInsights(stats, byAge, when, rateIn, count),
  };
}

function findInsights(
  stats: FinalistStat[],
  byAge: number[][],
  when: number[][],
  rateIn: (f: number, keep: (m: Member) => boolean) => number,
  count: (keep: (m: Member) => boolean) => number,
): Insight[] {
  const lead = best(stats.map((s, f) => ({ ...s, f })), (s) => s.rate);
  if (!lead) return [];
  const out: Insight[] = [];

  // The members' favourite, in its strongest gender × age × region segment big enough to quote.
  const segments = [0, 1].flatMap((g) =>
    AGES.flatMap((_, a) =>
      REGIONS.slice(0, -1).map((_, r) => {
        const keep = (m: Member) => m.gender === g && m.age === a && m.region === r;
        return { g, a, r, n: count(keep), rate: rateIn(lead.f, keep) };
      }),
    ),
  );
  const top = best(segments.filter((s) => s.n >= MIN_SEGMENT), (s) => s.rate);
  if (top) {
    out.push({
      title: `Strongest with ${top.g === 0 ? "women" : "men"} ${AGES[top.a]} in ${REGIONS[top.r]}`,
      body: `${pct(top.rate)} of these ${top.n} members swiped right on “${lead.headline}”, against ${pct(lead.rate)} of all members.`,
    });
  }

  const parents = count((m) => m.household === PARENTS);
  const forParents = best(stats.map((s, f) => ({ s, rate: rateIn(f, (m) => m.household === PARENTS) })), (x) => x.rate);
  if (forParents) {
    out.push({
      title: `Best finalist for parents: “${forParents.s.headline}”`,
      body: `${pct(forParents.rate)} of the ${parents} parents with kids swiped right on it, against ${pct(forParents.s.rate)} of all members.`,
    });
  }

  const splits = byAge.map((rates, f) => {
    const bands = AGES.map((_, a) => a);
    const hi = best(bands, (a) => rates[a] ?? 0) ?? 0;
    const lo = best(bands, (a) => -(rates[a] ?? 0)) ?? 0;
    return { f, hi, lo, gap: (rates[hi] ?? 0) - (rates[lo] ?? 0) };
  });
  const split = best(splits, (s) => s.gap);
  if (split) {
    const rates = byAge[split.f] ?? [];
    out.push({
      title: `“${stats[split.f]?.headline}” splits by age`,
      body: `${pct(rates[split.hi] ?? 0)} of members aged ${AGES[split.hi]} swiped right, against ${pct(rates[split.lo] ?? 0)} of those aged ${AGES[split.lo]}.`,
    });
  }

  const cells = when.flatMap((row, d) => row.map((n, h) => ({ d, h, n })));
  const peak = best(cells, (c) => c.n);
  const swipes = sum(cells.map((c) => c.n));
  if (peak && swipes > 0) {
    const evening = sum(when.map((row) => sum(row.slice(18, 23))));
    out.push({
      title: `Peak hour: ${DAYS[peak.d]}s, ${clock(peak.h)}–${clock(peak.h + 1)}`,
      body: `${pct(evening / swipes)} of all swipes land between 18:00 and 23:00, the best window for a sample drop.`,
    });
  }
  return out;
}
