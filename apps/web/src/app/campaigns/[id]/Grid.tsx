"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Ad, Campaign, Generation, Lever } from "@hack/contract";
import { safeStorage, type StorageLike } from "../../vote-lite/lite";
import { AdTile, type Delivered } from "./AdTile";
import { Heatmaps } from "./Heatmaps";
import { cullOrder, LEVER_LABEL, LEVERS, survived } from "./format";

const STEP_MS = 170; // 20 delivery snapshots ≈ 3.4 s
const CULL_MS = 2200; // every loser crossed out within ≈ 2.2 s, however many there are
const BEAT_MS = 650; // the pause between acts
const CTA = "e-pill e-lime min-h-[56px] px-7 text-[15px]";

/** Idle: every ad equal. Then budget flows (delivery), losers are crossed out (cull), survivors light up (kept), summary (done). */
type Phase = "idle" | "delivery" | "cull" | "kept" | "done";

/** The admin's Evolve call, offered as the next step after a rollout. `evolve` is null when this tab holds no admin token. */
export type Breed = { busy: boolean; failure: string | null; evolve: (() => void) | null };

/** sessionStorage, or an in-memory stand-in for this page view when the browser blocks it. */
export function tabStorage(): StorageLike {
  let raw: StorageLike | null = null;
  try {
    raw = window.sessionStorage;
  } catch {
    // Blocked: safeStorage keeps a memory copy instead.
  }
  return safeStorage(raw);
}

/**
 * One generation's ads. The simulation already ran on the server when the generation finished; "Simulate campaign
 * rollout" replays its recorded outcome: the 20 budget snapshots, then the cull, then the summary and the next step.
 */
export function Grid({ c, gen, isLast, breed, onNext, onOpen }: {
  c: Campaign;
  gen: Generation;
  isLast: boolean;
  breed: Breed;
  onNext: (gen: number) => void;
  onOpen: (id: string) => void;
}) {
  const key = `fk-rollout:${c.id}:${gen.gen}`;
  const [phase, setPhase] = useState<Phase>("idle");
  const [tick, setTick] = useState(0);
  const [lever, setLever] = useState<Lever | null>(null); // null = every lever
  const bar = useRef<HTMLDivElement>(null);
  const last = gen.timeline.length - 1;
  const ready = last >= 0 && gen.survivorIds.length > 0; // a generation still screening has nothing to roll out
  const losers = cullOrder(gen.ads);
  const cutAt = new Map(losers.map((a, i) => [a.id, i]));
  const kept = gen.ads.filter(survived).length;

  const finish = () => {
    setPhase("done");
    tabStorage().setItem(key, "1");
  };
  const start = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return finish();
    setTick(0);
    setPhase("delivery");
  };

  // A reload keeps the culled view: the rollout is remembered per campaign and generation for this tab.
  useEffect(() => {
    if (ready && tabStorage().getItem(key)) setPhase("done");
  }, [ready, key]);

  // One timer drives the rollout: each phase advances `tick`, then hands over to the next phase.
  useEffect(() => {
    const after = (ms: number, next: () => void) => {
      const timer = setTimeout(next, ms);
      return () => clearTimeout(timer);
    };
    if (phase === "delivery") {
      return tick < last ? after(STEP_MS, () => setTick(tick + 1)) : after(BEAT_MS, () => { setTick(0); setPhase("cull"); });
    }
    if (phase === "cull") {
      return tick < losers.length ? after(Math.max(20, CULL_MS / losers.length), () => setTick(tick + 1)) : after(BEAT_MS / 2, () => setPhase("kept"));
    }
    if (phase === "kept") {
      return after(BEAT_MS * 1.6, () => {
        finish();
        // Once the summary has rendered in place of the sticky counter, bring it and the heat maps into view.
        setTimeout(() => bar.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      });
    }
    // finish only writes state and storage under `key`, which is fixed for this keyed component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tick, last, losers.length]);

  const final = gen.timeline[last]?.impressionsByAd ?? {};
  const now = phase === "delivery" ? (gen.timeline[tick]?.impressionsByAd ?? {}) : phase === "idle" ? {} : final;
  const lead = Math.max(1, ...gen.ads.map((a) => now[a.id] ?? 0));
  const sum = (m: Record<string, number>) => Object.values(m).reduce((s, n) => s + n, 0);
  const budget = sum(final).toLocaleString("en-GB");
  const delivered = (a: Ad): Delivered | null => (ready ? { impressions: now[a.id] ?? 0, share: (now[a.id] ?? 0) / lead } : null);
  const verdict = (a: Ad): Ad["status"] | null =>
    !ready || phase === "done" ? a.status
    : phase === "kept" ? (a.status === "winner" ? "survivor" : a.status) // the crown waits for the summary
    : phase === "cull" && (cutAt.get(a.id) ?? Infinity) < tick ? "culled"
    : null;
  const ads = lever ? gen.ads.filter((a) => a.lever === lever) : gen.ads;

  const next: ReactNode = gen.ads.some((a) => a.status === "winner") ? (
    <Link href={`/campaigns/${encodeURIComponent(c.id)}/winner`} className={CTA}>Meet the winner →</Link>
  ) : !isLast ? (
    <button type="button" onClick={() => onNext(gen.gen + 1)} className={CTA}>See Gen {gen.gen + 1}, bred from these {kept} →</button>
  ) : breed.evolve ? (
    <button type="button" onClick={breed.evolve} disabled={breed.busy} className={CTA}>{breed.busy ? "Breeding…" : `Breed the ${kept} survivors →`}</button>
  ) : (
    <span className="e-mono text-[13px] uppercase tracking-[0.04em] text-muted">Next: breed the survivors (admin)</span>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <span className="e-lbl">Gen {gen.gen} · {gen.ads.length} ads</span>
        {!ready && <span className="text-[15px] text-muted">Screening now.</span>}
      </div>
      {ready && phase === "idle" && (
        <div ref={bar} className="e-tile mt-5 flex scroll-mt-4 flex-wrap items-center gap-x-6 gap-y-3 p-5 md:p-6">
          <button type="button" onClick={start} className={CTA}>
            Simulate campaign rollout
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4.5v15l13-7.5z" /></svg>
          </button>
          <span className="e-mono text-[13px] text-muted">Simulated rollout · {budget} impressions</span>
        </div>
      )}
      {(phase === "delivery" || phase === "cull" || phase === "kept") && (
        // Sticky, so the counter stays in view while the cards below are crossed out.
        <div ref={bar} className="e-tile sticky top-3 z-20 mt-5 flex scroll-mt-4 flex-wrap items-center gap-x-5 gap-y-2 p-5 shadow-[0_8px_24px_rgb(0_0_0/0.08)] md:p-6">
          <span className="e-h min-w-[5.2ch] text-[36px] tabular-nums md:text-[44px]">{sum(now).toLocaleString("en-GB")}</span>
          <span className="text-[15px] text-muted">of {budget} simulated impressions</span>
          <span className="e-mono text-[13px] uppercase tracking-[0.04em]">
            {phase === "delivery" ? "Delivering budget" : phase === "cull" ? `Cutting ${Math.min(tick, losers.length)} of ${losers.length}` : `${kept} survive`}
          </span>
          <button type="button" onClick={finish} className="e-pill e-outline ml-auto">Skip</button>
        </div>
      )}
      {ready && phase === "done" && (
        <>
          <div ref={bar} className="e-tile fk-blur-in mt-5 flex scroll-mt-4 flex-wrap items-center justify-between gap-x-6 gap-y-4 p-5 md:p-7">
            <div className="min-w-0">
              <p className="e-h text-[40px] md:text-[56px]">{kept} survive · {losers.length} cut</p>
              <p className="mt-1 text-[15px] text-muted">
                Simulated rollout · {budget} impressions ·{" "}
                <button type="button" onClick={start} className="cursor-pointer underline underline-offset-4 hover:text-ink">Replay rollout</button>
              </p>
            </div>
            <div className="flex flex-col items-start gap-2">
              {next}
              {breed.failure && <span role="alert" className="text-[13px] text-bad">{breed.failure}</span>}
            </div>
          </div>
          <div className="mt-6"><Heatmaps campaign={c} /></div>
        </>
      )}
      <div role="group" aria-label="Filter by lever" className="mt-6 flex flex-wrap gap-2">
        <Chip on={lever == null} onClick={() => setLever(null)} label="All" n={gen.ads.length} />
        {LEVERS.map((l) => {
          const n = gen.ads.filter((a) => a.lever === l).length;
          return n > 0 && <Chip key={l} on={lever === l} onClick={() => setLever(l)} label={LEVER_LABEL[l]} n={n} />;
        })}
      </div>
      {/* Keyed by the filter, so a new filter deals its cards in again. Plain generated order: nothing is ranked until the rollout. */}
      <div key={lever ?? "all"} className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-6">
        {ads.map((ad, i) => (
          // Each card pops in over a shimmer slot, 40 ms after the one before, capped at about 1 s for the last.
          <div key={ad.id} className="fk-shimmer fk-slot min-w-0 rounded-[18px]">
            <div
              className="fk-pop grid h-full transition-[translate] duration-200 hover:-translate-y-1 motion-reduce:transition-none"
              style={{ "--d": `${Math.min(i, 24) * 40}ms` } as CSSProperties}
            >
              <AdTile ad={ad} product={c.product} delivered={delivered(ad)} verdict={verdict(ad)} stats={!ready || phase === "done"} onOpen={() => onOpen(ad.id)} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Chip({ on, onClick, label, n }: { on: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm ${on ? "border-ink bg-ink text-white" : "border-edge bg-white hover:border-ink/40"}`}
    >
      {label}
      <span className={on ? "text-white/60" : "text-muted"}>{n}</span>
    </button>
  );
}
