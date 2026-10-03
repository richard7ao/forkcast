import type { CSSProperties } from "react";
import type { Ad, Product, Rate } from "@hack/contract";
import { LEVER_LABEL, survived } from "./format";

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
const CHIP = "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight";

/**
 * One ad in the grid, as a 9:16 creative: the render full bleed, with the headline designed into the image. `rank` is its place in the
 * simulated rollout (1 = best), null until the rollout has ranked the generation, so every ad starts out equal.
 */
export function AdTile({ ad, product, delivered, rank, onOpen }: {
  ad: Ad; product: Product; delivered: Delivered | null; rank: number | null; onOpen: () => void;
}) {
  const top = rank != null && survived(ad);
  const badge = top ? (ad.status === "winner" ? "Winner" : "Survivor") : ad.status === "screening" ? "Screening" : null;
  return (
    <div className={`group relative aspect-[9/16] min-w-0 rounded-[18px] ${rank === 1 ? "fk-crown" : top ? "fk-glow" : ""}`}>
      <div className="absolute inset-0 overflow-hidden rounded-[18px] bg-[#1D1D1D]">
        <div className={`absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none ${rank != null && !top ? "opacity-80" : ""}`}>
          <img src={ad.imageUrl ?? product.imageUrl} alt="" loading="lazy" className="size-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" />
          <div aria-hidden className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-black/30 to-transparent" />
        </div>
        <div aria-hidden className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
          <span className="size-[22px] rounded-full border-[1.5px] border-white/90 bg-black/15" />
          <span className="grid size-[18px] place-items-center rounded-full bg-white text-[10px] font-bold text-ink">{product.brand.charAt(0).toUpperCase()}</span>
        </div>
        {(rank != null || badge) && (
          <div className="absolute right-2.5 top-2.5 flex flex-col items-end gap-1.5">
            {rank != null && (
              <span key={rank} className={`fk-badge inline-flex items-center gap-1 tabular-nums ${CHIP} ${rank === 1 ? "e-lime" : "bg-black/65 text-white"}`}>
                {rank === 1 && <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M3 18h18l-1.6-11-5.1 4.6L12 4l-2.3 7.6L4.6 7z" /></svg>}#{rank}
              </span>
            )}
            {badge && <span className={`fk-badge ${CHIP} ${top ? "e-lime" : "bg-white text-ai"}`}>{badge}</span>}
          </div>
        )}
        {rank != null && ad.experiment && (
          <span className={`fk-badge absolute bottom-3 left-2.5 bg-white/90 tabular-nums text-ink transition-opacity group-hover:opacity-0 group-focus-within:opacity-0 ${CHIP}`}>
            Simulated CTR {(ad.experiment.ctr * 100).toFixed(1)}%
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 flex translate-y-2 flex-col bg-gradient-to-t from-black/85 to-transparent px-3 pb-3.5 pt-10 text-left opacity-0 transition duration-200 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none">
          <span className="text-[11px] text-white/75">{LEVER_LABEL[ad.lever]}</span>
          <span className="text-[13px] font-medium text-white">See the ad</span>
        </div>
        {delivered && (
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
            <span className="e-lime absolute inset-y-0 left-0 transition-[width] duration-150 motion-reduce:transition-none" style={{ width: `${delivered.share * 100}%` }} />
          </span>
        )}
      </div>
      {ad.status === "winner" && rank === 1 && (
        <span aria-hidden className="fk-burst pointer-events-none absolute inset-0">
          {Array.from({ length: 14 }, (_, i) => (
            <i key={i} style={{ "--a": `${i * (360 / 14)}deg`, "--c": BURST[i % BURST.length], "--d": `${(i % 3) * 60}ms` } as CSSProperties} />
          ))}
        </span>
      )}
      <button type="button" onClick={onOpen} aria-label={`Details for “${ad.headline}”${rank != null ? `, ranked #${rank}` : ""}`} className="absolute inset-0 cursor-pointer rounded-[18px]" />
    </div>
  );
}
