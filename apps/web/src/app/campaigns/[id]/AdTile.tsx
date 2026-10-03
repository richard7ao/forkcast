import type { CSSProperties } from "react";
import type { Ad, Product, Rate } from "@hack/contract";
import { AdCard } from "../../vote-lite/AdCard";
import { fmtCtr, fmtRate, LEVER_LABEL, sceneLabel, STATUS_LABEL, survived } from "./format";

const BADGE: Record<Ad["status"], string> = {
  winner: "e-lime",
  survivor: "bg-forest text-white",
  screening: "border border-ai text-ai",
  culled: "border border-ink/35 text-muted",
};

/** The ring real feed cards have. It frames the shared AdCard without restyling it: the card is the stimulus. */
export const CARD_FRAME = "overflow-hidden rounded-xl shadow-[0_0_0_1px_rgba(0,0,0,.06),0_1px_2px_rgba(0,0,0,.10)]";

/** A rate's interval as a band, with a dot at the rate. Same 0–100% scale everywhere. */
export function RateBar({ rate, band, dot }: { rate: Rate; band: string; dot: string }) {
  if (rate.rate == null || rate.lo == null || rate.hi == null) return null;
  return (
    <div aria-hidden className="relative h-1.5 rounded-full bg-track">
      <span className={`absolute inset-y-0 rounded-full ${band}`} style={{ left: `${rate.lo * 100}%`, width: `${(rate.hi - rate.lo) * 100}%` }} />
      <span className={`absolute -top-1 size-3.5 -translate-x-1/2 rounded-full ring-2 ring-white ${dot}`} style={{ left: `${rate.rate * 100}%` }} />
    </div>
  );
}

/** Simulated delivery for one tile: impressions so far and its share of the leading ad's. */
export type Delivered = { impressions: number; share: number };

const BURST = ["#B6F000", "#2BA84A", "#C2E773", "#336138"];

/**
 * One ad in the grid. `verdict` is what the rollout has decided about it so far: null until the cull reaches it, so
 * every ad starts out equal. `stats` shows its numbers, which appear only once the rollout has finished.
 */
export function AdTile({ ad, product, delivered, verdict, stats, onOpen }: {
  ad: Ad; product: Product; delivered: Delivered | null; verdict: Ad["status"] | null; stats: boolean; onOpen: () => void;
}) {
  const { ai } = ad.fitness;
  const cut = verdict === "culled";
  const kept = verdict === "survivor" || verdict === "winner";
  return (
    <div className={`e-pol relative flex min-w-0 flex-col gap-2.5 ${verdict === "winner" ? "fk-crown" : kept ? "fk-glow" : ""}`}>
      <div className="flex min-h-[26px] items-center justify-between gap-2 px-0.5 pt-0.5">
        {verdict ? (
          <span key={verdict} className={`fk-badge whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium leading-tight ${BADGE[verdict]}`}>{STATUS_LABEL[verdict]}</span>
        ) : <span />}
        <span className="text-right text-xs leading-tight text-muted">{LEVER_LABEL[ad.lever]} × {sceneLabel(ad.scene)}</span>
      </div>
      <div className={`relative ${CARD_FRAME}`}>
        <div className={`transition-[filter,opacity] duration-500 motion-reduce:transition-none ${cut ? "opacity-45 grayscale" : ""}`}>
          <AdCard product={product} variant={ad} />
        </div>
        {cut && (
          <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="fk-cross absolute inset-0 size-full">
            <path pathLength={1} d="M10 10 L90 90" />
            <path pathLength={1} d="M90 10 L10 90" />
          </svg>
        )}
      </div>
      <div className="flex flex-col gap-2 px-0.5 pt-0.5 text-[13px] tabular-nums">
        {delivered && (
          <div className="flex items-center gap-2.5">
            <div aria-hidden className="relative h-1.5 flex-1 rounded-full bg-track">
              <span
                className="e-lime absolute inset-y-0 left-0 rounded-full transition-[width] duration-150 motion-reduce:transition-none"
                style={{ width: `${delivered.share * 100}%` }}
              />
            </div>
            <span className="e-mono min-w-[4ch] text-right text-xs text-muted">{delivered.impressions > 0 && delivered.impressions.toLocaleString("en-GB")}</span>
          </div>
        )}
        {stats && (
          <div className="fk-pop flex flex-col gap-2">
            {ad.experiment && <span><span className="font-medium">Simulated</span> CTR {fmtCtr(ad.experiment)}</span>}
            {ai && <RateBar rate={ai} band="bg-ai-mark" dot="bg-ai" />}
            <span>
              {survived(ad) && <span aria-hidden className="text-forest">▲ </span>}
              <span className="font-medium text-ai">AI shoppers</span> {ai ? fmtRate(ai) : "screening"}
            </span>
          </div>
        )}
      </div>
      {verdict === "winner" && (
        <span aria-hidden className="fk-burst pointer-events-none absolute inset-0">
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} style={{ "--a": `${i * (360 / 14)}deg`, "--c": BURST[i % BURST.length], "--d": `${(i % 3) * 60}ms` } as CSSProperties} />
          ))}
        </span>
      )}
      <button type="button" onClick={onOpen} aria-label={`Details for “${ad.headline}”`} className="absolute inset-0 cursor-pointer rounded-[18px]" />
    </div>
  );
}
