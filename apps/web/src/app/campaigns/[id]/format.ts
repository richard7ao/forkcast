import type { Ad, Campaign, Experiment, Lever, Rate } from "@hack/contract";

export const LEVERS: Lever[] = ["social_proof", "scarcity", "health_halo", "indulgence", "provenance", "value"];

export const LEVER_LABEL: Record<Lever, string> = {
  social_proof: "Social proof", scarcity: "Scarcity", health_halo: "Health halo",
  indulgence: "Indulgence", provenance: "Provenance", value: "Value",
};

const pct = (x: number) => Math.round(x * 100);

/** The house format for every rate: "66% (54–76) · n 47". The API sends full precision. */
export function fmtRate(r: Rate): string {
  return r.rate == null || r.lo == null || r.hi == null
    ? `No data yet · n ${r.n}`
    : `${pct(r.rate)}% (${pct(r.lo)}–${pct(r.hi)}) · n ${r.n}`;
}

/** Simulated delivery. One decimal, because CTRs are small: "3.1% (2.5–3.8) · 1,831 impressions". */
export function fmtCtr(e: Experiment): string {
  const p = (x: number) => (x * 100).toFixed(1);
  return `${p(e.ctr)}% (${p(e.lo)}–${p(e.hi)}) · ${e.impressions.toLocaleString("en-GB")} impressions`;
}

/**
 * A short name for the scene an image was rendered from, e.g. "Relaxed backyard BBQ".
 * ponytail: parsed from the render prompt's opening clause; ask the backend for a label field if prompts change shape.
 */
export function sceneLabel(scene: string): string {
  const m = /^(?:\d+\.\s*)?(?:an?|the)\s+(.+?)(?:\s+scene)?\s+\w+\s+the\s+(?:exactly\s+)?unchanged\b/i.exec(scene);
  const label = m?.[1] ?? scene.split(/\s+/).slice(0, 4).join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const allAds = (c: Campaign): Ad[] => c.generations.flatMap((g) => g.ads);

/**
 * Survivors are carried into the next generation under the same id, re-screened, so an id is unique only
 * within a generation. With `gen`, look in that generation; without, return the ad where it first appeared.
 */
export function findAd(c: Campaign, id: string, gen?: number): Ad | undefined {
  const pool = gen == null ? allAds(c) : (c.generations.find((g) => g.gen === gen)?.ads ?? []);
  return pool.find((a) => a.id === id);
}

/** Each ad once, at its first appearance. */
export const firstCopies = (ads: Ad[]): Ad[] => ads.filter((a, i) => ads.findIndex((b) => b.id === a.id) === i);

export const STATUS_LABEL: Record<Ad["status"], string> = { winner: "Winner", survivor: "Survivor", screening: "Screening", culled: "Culled" };

export const survived = (a: Ad) => a.status === "survivor" || a.status === "winner";

const STATUS_RANK: Record<Ad["status"], number> = { winner: 0, survivor: 1, screening: 2, culled: 3 };

/** Winner, then survivors, then the rest; fittest first within each group. */
export const byFitness = (a: Ad, b: Ad) =>
  STATUS_RANK[a.status] - STATUS_RANK[b.status] || (b.fitness.ai?.rate ?? -1) - (a.fitness.ai?.rate ?? -1);

export type Step = { key: string; label: string; state: "done" | "run" | "todo"; gen: number | null };

/** "Gen 0 · 48 ads → 6 survive → Gen 1 · 30 ads → 6 survive → Winner", including a generation still being written. */
export function railSteps(c: Campaign): Step[] {
  const running = c.stage !== "done" && c.stage !== "error";
  const steps: Step[] = c.generations.flatMap((g): Step[] => {
    const selected = g.survivorIds.length > 0;
    return [
      { key: `g${g.gen}`, gen: g.gen, label: `Gen ${g.gen} · ${g.ads.length} ads`, state: selected ? "done" : running ? "run" : "todo" },
      { key: `s${g.gen}`, gen: g.gen, label: selected ? `${g.survivorIds.length} survive` : "Survivors", state: selected ? "done" : "todo" },
    ];
  });
  const last = c.generations.at(-1);
  if (running && (!last || last.survivorIds.length > 0)) {
    const gen = c.generations.length;
    steps.push({ key: `g${gen}`, gen: null, label: `Gen ${gen}`, state: "run" }, { key: `s${gen}`, gen: null, label: "Survivors", state: "todo" });
  }
  steps.push({ key: "winner", gen: null, label: "Winner", state: c.winnerId ? "done" : "todo" });
  return steps;
}
