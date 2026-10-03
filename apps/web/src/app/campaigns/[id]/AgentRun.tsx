"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Campaign, CampaignStage } from "@hack/contract";

/** The four steps people see, after getgimmegimme.com's "1 Brand 2 Competitors 3 Angles 4 Ads". */
export const RUN_STEPS: { label: string; stages: CampaignStage[] }[] = [
  { label: "Pack", stages: ["reading"] },
  { label: "Ads", stages: ["writing", "rendering"] },
  { label: "AI shoppers", stages: ["screening"] },
  { label: "Experiment", stages: ["simulating", "selecting"] },
];

const ORDER: CampaignStage[] = ["reading", "writing", "rendering", "screening", "simulating", "selecting"];
/** Typical seconds per stage on a live run, about 3 min in all. A replay of a known photo takes seconds. */
const LIVE_S: Partial<Record<CampaignStage, number>> = { reading: 10, writing: 60, rendering: 80, screening: 15, simulating: 3, selecting: 2 };
const TITLE: Partial<Record<CampaignStage, string>> = {
  reading: "Reading your pack",
  writing: "Writing the ads",
  rendering: "Rendering the scenes",
  screening: "Asking the AI shoppers",
  simulating: "Simulating Meta delivery",
  selecting: "Keeping the fittest",
};
const SUBTITLE: Partial<Record<CampaignStage, string>> = {
  reading: "Reading the pack",
  writing: "Writing copy",
  rendering: "Rendering scenes",
  screening: "AI shoppers screening",
  simulating: "Simulating delivery",
  selecting: "Selecting survivors",
};

/** Replay labels say so ("Same photo as an earlier run: replaying it", "Reusing 8 renders…"). */
const isReplay = (label: string) => /replay|reus/i.test(label);
const fraction = (c: Campaign) => (c.progress.total > 0 ? Math.min(1, c.progress.done / c.progress.total) : 0);

/** Time left from the stage, so the estimate never runs backwards when a fast replay skips through. */
export function eta(stage: CampaignStage, f: number, replay: boolean): string {
  if (replay) return "a few seconds left";
  const i = ORDER.indexOf(stage);
  const s = (LIVE_S[stage] ?? 0) * (1 - f) + ORDER.slice(i + 1).reduce((sum, st) => sum + (LIVE_S[st] ?? 0), 0);
  return s >= 45 ? `about ${Math.round(s / 60)} min left` : s >= 10 ? "under a minute left" : "a few seconds left";
}

/** Which of the four steps is running, and how far through it: stages in one step split it evenly. */
export function stepAt(c: Campaign): { at: number; f: number } {
  if (c.stage === "done") return { at: RUN_STEPS.length, f: 1 };
  const at = RUN_STEPS.findIndex((s) => s.stages.includes(c.stage));
  if (at < 0) return { at: 0, f: 0 };
  const stages = RUN_STEPS[at]!.stages;
  return { at, f: (stages.indexOf(c.stage) + fraction(c)) / stages.length };
}

/**
 * Ads a generation will hold. Gen 0 is 6 levers x 8 scenes; each later one is the survivors plus 4 children each.
 * ponytail: mirrors apps/api/src/lib/evolve.ts constants; ask for a progress field if those change.
 */
const adsInRun = (c: Campaign) => {
  const last = c.generations.at(-1);
  return last ? last.survivorIds.length * 5 : 48;
};

/** Ads with an image so far: none while copy is written, then in step with the renders. */
function readyAds(c: Campaign, target: number): number {
  if (c.stage === "reading" || c.stage === "writing") return 0;
  return c.stage === "rendering" ? Math.round(fraction(c) * target) : target;
}

/** Eases a number toward its target over about one poll, so the counter climbs instead of jumping. */
function useTween(target: number, ms = 1600): number {
  const [shown, setShown] = useState(target);
  const at = useRef(target);
  useEffect(() => {
    const from = at.current;
    if (from === target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      at.current = target;
      setShown(target);
      return;
    }
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(t) {
      const k = Math.min(1, (t - t0) / ms);
      at.current = from + (target - from) * (1 - (1 - k) ** 3);
      setShown(at.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return Math.round(shown);
}

/** Each distinct progress label seen while polling, in order: the agent's log. */
function useLog(label: string): string[] {
  const [log, setLog] = useState([label]);
  useEffect(() => setLog((l) => (l.includes(label) ? l : [...l, label])), [label]);
  return log;
}

const Spinner = () => (
  <span aria-hidden className="mt-0.5 size-3.5 flex-none animate-spin rounded-full border-2 border-ink/15 border-t-ink motion-reduce:animate-none" />
);
const Check = () => (
  <span aria-hidden className="e-lime mt-0.5 grid size-3.5 flex-none place-items-center rounded-full text-[9px] font-bold">✓</span>
);

/** Four segments: done ones solid, the running one filling. Reused, all ticked, on the results. */
export function StepBar({ at, f }: { at: number; f: number }) {
  return (
    <ol className="grid grid-cols-4 gap-1.5">
      {RUN_STEPS.map((s, i) => (
        <li key={s.label} aria-current={i === at ? "step" : undefined} className="flex min-w-0 flex-col gap-2">
          <span className="relative h-1.5 overflow-hidden rounded-full bg-track">
            <span
              className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 motion-reduce:transition-none ${i < at ? "bg-ink" : "e-lime"}`}
              style={{ width: `${i < at ? 100 : i === at ? Math.max(8, f * 100) : 0}%` }}
            />
          </span>
          <span className={`text-[11px] leading-tight ${i === at ? "font-medium text-ink" : i < at ? "text-ink" : "text-muted"}`}>
            {i < at ? "✓" : i + 1} {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The running screen: progress and the agent's log on the left, what it is doing now on the right. */
export function AgentRun({ c }: { c: Campaign }) {
  const { label, done, total } = c.progress;
  const log = useLog(label);
  const replay = log.some(isReplay);
  const { at, f } = stepAt(c);
  const left = eta(c.stage, fraction(c), replay);
  const target = adsInRun(c);
  const ready = useTween(readyAds(c, target));
  const last = c.generations.at(-1);
  const title = last ? `Breeding generation ${last.gen + 1}` : (TITLE[c.stage] ?? "Starting the agent");

  return (
    <section aria-label="Run progress" className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="min-w-0 lg:col-start-2">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[15px] text-muted">Step {Math.min(at + 1, RUN_STEPS.length)} of {RUN_STEPS.length} · {left}</p>
            <h1 key={title} className="e-h fk-blur-in mt-1.5 text-[36px] md:text-[48px]">{title}</h1>
            <p aria-live="polite" className="mt-2 text-[17px] text-muted">
              {label}
              {total > 1 && !replay && ` · ${done} of ${total}`}
            </p>
          </div>
          <Counter reading={c.stage === "reading"} ready={ready} target={target} />
        </div>
        <div className="mt-8">{c.stage === "reading" ? <PackScan c={c} /> : <Slots />}</div>
      </div>
      <aside className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1">
        <div className="e-tile p-4 shadow-[0_8px_24px_rgb(0_0_0/0.05)]">
          <StepBar at={at} f={f} />
          <p className="mt-3 text-[13px] text-muted">{SUBTITLE[c.stage] ?? "Starting"} · {left}</p>
        </div>
        <div className="e-tile p-4 shadow-[0_8px_24px_rgb(0_0_0/0.05)]">
          <h2 className="text-[13px] font-medium text-muted">What the agent has done</h2>
          <ul className="mt-3 flex flex-col gap-2.5">
            {log.map((l) => (
              <li key={l} className="fk-pop flex items-start gap-2.5 text-sm leading-snug">
                {l === label ? <Spinner /> : <Check />}
                <span className="min-w-0">{l}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </section>
  );
}

/** "0 of 48 ready" with empty tiles while the pack is read, then a big counter that climbs with the renders. */
function Counter({ reading, ready, target }: { reading: boolean; ready: number; target: number }) {
  if (reading) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div aria-hidden className="flex gap-1.5">
          {Array.from({ length: 5 }, (_, i) => <span key={i} className="fk-shimmer h-9 w-6 rounded-md" style={{ "--d": `${i * 120}ms` } as CSSProperties} />)}
        </div>
        <p className="text-[13px] text-muted"><b className="font-medium text-ink">0</b> of {target} ready</p>
      </div>
    );
  }
  return (
    <div className="fk-blur-in flex flex-col items-end">
      <p className="e-mono text-[44px] leading-none tracking-[-0.04em] tabular-nums md:text-[56px]" aria-label={`${ready} of ${target} ads ready`}>
        {String(ready).padStart(2, "0")}<span className="text-ink/25">/{target}</span>
      </p>
      <p className="mt-1 text-[13px] text-muted">ads ready</p>
    </div>
  );
}

/** A browser-window frame round the pack photo, with a scan band sweeping down it while the pack is read. */
function PackScan({ c }: { c: Campaign }) {
  const facts = c.product.facts;
  return (
    <div className="e-tile overflow-hidden shadow-[0_14px_36px_rgb(0_0_0/0.08)]">
      <div className="flex items-center gap-3 border-b border-line bg-[#FAFAFA] px-4 py-2.5">
        <span aria-hidden className="flex gap-1.5">
          {[0, 1, 2].map((i) => <span key={i} className="size-2.5 rounded-full bg-ink/15" />)}
        </span>
        <span className="mx-auto max-w-[60%] truncate rounded-full border border-line bg-white px-3 py-0.5 text-xs text-muted">pack photo</span>
        <span aria-hidden className="w-[42px]" />
      </div>
      <div className="fk-shimmer relative h-[300px] overflow-hidden md:h-[400px]">
        <img src={c.sourceImageUrl} alt="Your pack photo" className="absolute inset-0 size-full object-contain p-6" />
        <span aria-hidden className="fk-scan absolute inset-x-0 top-0 h-1/4" />
        <span className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs shadow-sm">
          <Spinner /> Scanning
        </span>
      </div>
      <div className="flex min-h-[92px] flex-col gap-3 p-4">
        {facts.length > 0 ? (
          <>
            <span className="e-lbl">Read off the pack</span>
            <ul className="flex flex-wrap gap-2">
              {facts.map((x, i) => <li key={i} className="e-chip fk-pop" style={{ "--d": `${i * 60}ms` } as CSSProperties}>{x}</li>)}
            </ul>
          </>
        ) : (
          <>
            <span aria-hidden className="fk-shimmer h-4 w-32 rounded-md" />
            <span aria-hidden className="grid grid-cols-3 gap-2 md:grid-cols-5">
              {Array.from({ length: 5 }, (_, i) => <span key={i} className={`fk-shimmer h-8 rounded-lg ${i > 2 ? "hidden md:block" : ""}`} />)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** Shimmer cards where the ads will land. */
function Slots() {
  return (
    <div aria-hidden className="grid grid-cols-3 gap-3 md:grid-cols-6">
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} className={`fk-shimmer aspect-[4/5] rounded-[14px] ${i >= 6 ? "hidden md:block" : ""}`} style={{ "--d": `${(i % 6) * 90}ms` } as CSSProperties} />
      ))}
    </div>
  );
}
