"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Ad, Campaign, Generation, Lever } from "@hack/contract";
import { safeStorage, type StorageLike } from "../../vote-lite/lite";
import { AdTile, type Delivered } from "./AdTile";
import { LEVER_LABEL, LEVERS, rankAds, survived } from "./format";

const STEP_MS = 170; // 20 delivery snapshots ≈ 3.4 s
const RANK_MS = 1800; // the re-sort slides (FLIP_MS), then the badges settle before the summary
const FLIP_MS = 700;
const BEAT_MS = 650; // the pause between acts
const CTA = "e-pill e-lime min-h-[56px] px-7 text-[15px]";
const SECOND = "e-pill e-outline min-h-[56px] px-7 text-[15px]";

/** Idle: every ad equal, in generated order. Then budget flows (delivery), the grid re-sorts best to worst (rank), summary (done). */
type Phase = "idle" | "delivery" | "rank" | "done";

/** Evolve, offered as the next step after the latest generation's rollout. */
export type Breed = { busy: boolean; failure: string | null; evolve: () => void };

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
 * rollout" replays its recorded outcome: the 20 budget snapshots, then the re-sort best to worst, then the summary and the next step.
 */
export function Grid({ c, gen, isLast, breed, onNext, onOpen, onHeatmaps }: {
  c: Campaign;
  gen: Generation;
  isLast: boolean;
  breed: Breed;
  onNext: (gen: number) => void;
  onOpen: (id: string) => void;
  onHeatmaps: () => void;
}) {
  const key = `fk-rollout:${c.id}:${gen.gen}`;
  const [zoom, setZoom] = useState<Ad | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [tick, setTick] = useState(0);
  const [lever, setLever] = useState<Lever | null>(null); // null = every lever
  const bar = useRef<HTMLDivElement>(null);
  const last = gen.timeline.length - 1;
  const ready = last >= 0 && gen.survivorIds.length > 0; // a generation still screening has nothing to roll out
  const kept = gen.ads.filter(survived).length;
  const ranked = ready && (phase === "rank" || phase === "done");
  // Best to worst by simulated CTR: the winner, then the survivors, then the rest (format.ts rankAds).
  const rankOf = new Map(rankAds(gen.ads).map((a, i) => [a.id, i + 1]));
  const tiles = useRef(new Map<string, HTMLElement>());
  const spots = useRef(new Map<string, { x: number; y: number }>());

  const finish = () => {
    setPhase("done");
    tabStorage().setItem(key, "1");
  };
  const start = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return finish();
    setTick(0);
    setPhase("delivery");
  };

  // A reload keeps the ranked view: the rollout is remembered per campaign and generation for this tab.
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
      return tick < last ? after(STEP_MS, () => setTick(tick + 1)) : after(BEAT_MS, () => setPhase("rank"));
    }
    if (phase === "rank") {
      return after(RANK_MS, () => {
        finish();
        // Once the summary has rendered in place of the sticky counter, bring it and the heat maps into view.
        setTimeout(() => bar.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      });
    }
    // finish only writes state and storage under `key`, which is fixed for this keyed component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tick, last]);

  // FLIP: when the order changes, each tile slides from where it was to its new place. Offsets are measured
  // against the grid, so a scroll or the summary appearing above never reads as movement.
  useLayoutEffect(() => {
    const now = new Map([...tiles.current].map(([id, el]) => [id, { x: el.offsetLeft, y: el.offsetTop }]));
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const [id, el] of tiles.current) {
        const was = spots.current.get(id);
        const at = now.get(id)!;
        if (was && (was.x !== at.x || was.y !== at.y)) {
          el.animate([{ transform: `translate(${was.x - at.x}px, ${was.y - at.y}px)` }, { transform: "none" }], { duration: FLIP_MS, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" });
        }
      }
    }
    spots.current = now;
  });

  const final = gen.timeline[last]?.impressionsByAd ?? {};
  const now = phase === "delivery" ? (gen.timeline[tick]?.impressionsByAd ?? {}) : phase === "idle" ? {} : final;
  const lead = Math.max(1, ...gen.ads.map((a) => now[a.id] ?? 0));
  const sum = (m: Record<string, number>) => Object.values(m).reduce((s, n) => s + n, 0);
  const budget = sum(final).toLocaleString("en-GB");
  const delivered = (a: Ad): Delivered | null => (ready ? { impressions: now[a.id] ?? 0, share: (now[a.id] ?? 0) / lead } : null);
  const shown = lever ? gen.ads.filter((a) => a.lever === lever) : gen.ads;
  const ads = ranked ? rankAds(shown) : shown;

  // Every rollout ends on the winner page (format.ts winnerOf); breeding or the next generation is the second step.
  const then: ReactNode = gen.ads.some((a) => a.status === "winner") ? null : !isLast ? (
    <button type="button" onClick={() => onNext(gen.gen + 1)} className={SECOND}>See Gen {gen.gen + 1} →</button>
  ) : (
    <button type="button" onClick={breed.evolve} disabled={breed.busy} className={SECOND}>{breed.busy ? "Breeding…" : `Breed the ${kept} survivors →`}</button>
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
      {(phase === "delivery" || phase === "rank") && (
        // Sticky, so the counter stays in view while the cards below fill and re-sort.
        <div ref={bar} className="e-tile sticky top-3 z-20 mt-5 flex scroll-mt-4 flex-wrap items-center gap-x-5 gap-y-2 p-5 shadow-[0_8px_24px_rgb(0_0_0/0.08)] md:p-6">
          <span className="e-h min-w-[5.2ch] text-[36px] tabular-nums md:text-[44px]">{sum(now).toLocaleString("en-GB")}</span>
          <span className="text-[15px] text-muted">of {budget} simulated impressions</span>
          <span className="e-mono text-[13px] uppercase tracking-[0.04em]">
            {phase === "delivery" ? "Delivering budget" : `Ranked by simulated CTR · top ${kept} survive`}
          </span>
          <button type="button" onClick={finish} className="e-pill e-outline ml-auto">Skip</button>
        </div>
      )}
      {ready && phase === "done" && (
        <>
          <div ref={bar} className="e-tile fk-blur-in mt-5 flex scroll-mt-4 flex-wrap items-center justify-between gap-x-6 gap-y-4 p-5 md:p-7">
            <div className="min-w-0">
              <p className="e-h text-[40px] md:text-[56px]">Top {kept} of {gen.ads.length} survive</p>
              <p className="mt-1 text-[15px] text-muted">
                Simulated rollout · {budget} impressions ·{" "}
                <button type="button" onClick={start} className="cursor-pointer underline underline-offset-4 hover:text-ink">Replay rollout</button>
                {" · "}
                <button type="button" onClick={onHeatmaps} className="cursor-pointer underline underline-offset-4 hover:text-ink">See heat maps →</button>
              </p>
            </div>
            <div className="flex flex-col items-start gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/campaigns/${encodeURIComponent(c.id)}/winner`} className={`${CTA} min-h-[64px] px-9 text-[17px]`}>Meet the winner →</Link>
                {then}
              </div>
              {breed.failure && <span role="alert" className="text-[13px] text-bad">{breed.failure}</span>}
            </div>
          </div>
        </>
      )}
      <div role="group" aria-label="Filter by lever" className="mt-6 flex flex-wrap gap-2">
        <Chip on={lever == null} onClick={() => setLever(null)} label="All" n={gen.ads.length} />
        {LEVERS.map((l) => {
          const n = gen.ads.filter((a) => a.lever === l).length;
          return n > 0 && <Chip key={l} on={lever === l} onClick={() => setLever(l)} label={LEVER_LABEL[l]} n={n} />;
        })}
      </div>
      {/* Keyed by the filter, so a new filter deals its cards in again. Generated order until the rollout ranks them. */}
      <div key={lever ?? "all"} className="relative mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
        {ads.map((ad, i) => (
          // Each card pops in over a shimmer slot, 40 ms after the one before, capped at about 1 s for the last.
          <div
            key={ad.id}
            ref={(el) => { if (el) tiles.current.set(ad.id, el); else tiles.current.delete(ad.id); }}
            className="fk-shimmer fk-slot min-w-0 rounded-[18px]"
          >
            <div
              className="fk-pop grid h-full transition-[translate] duration-200 hover:-translate-y-1 motion-reduce:transition-none"
              style={{ "--d": `${Math.min(i, 24) * 40}ms` } as CSSProperties}
            >
              <AdTile ad={ad} product={c.product} delivered={delivered(ad)} rank={ranked ? (rankOf.get(ad.id) ?? null) : null} onOpen={() => setZoom(ad)} />
            </div>
          </div>
        ))}
      </div>
      {zoom && <Lightbox ad={zoom} onClose={() => setZoom(null)} onOpen={() => onOpen(zoom.id)} />}
    </>
  );
}

/** First click on a tile shows the creative large; a click on it opens the ad's page. Esc or the backdrop closes. */
function Lightbox({ ad, onClose, onOpen }: { ad: Ad; onClose: () => void; onOpen: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={ad.headline} onClick={onClose} className="fk-fade fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className="fk-zoom-in flex w-full max-w-[min(90vw,620px)] cursor-pointer flex-col items-center gap-3"
      >
        <img src={ad.imageUrl} alt={ad.headline} className="w-full rounded-[18px] shadow-2xl" />
        <span className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-ink">See how it performed →</span>
      </button>
    </div>
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
