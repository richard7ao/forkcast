import type { Ad, Product, Rate } from "@hack/contract";
import { AdCard } from "../../vote-lite/AdCard";
import { fmtRate, LEVER_LABEL, sceneLabel, STATUS_LABEL, survived } from "./format";

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

export function AdTile({ ad, product, onOpen }: { ad: Ad; product: Product; onOpen: () => void }) {
  const { ai, human } = ad.fitness;
  return (
    <div className="e-pol relative flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2 px-0.5 pt-0.5">
        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium leading-tight ${BADGE[ad.status]}`}>{STATUS_LABEL[ad.status]}</span>
        <span className="text-right text-xs leading-tight text-muted">{LEVER_LABEL[ad.lever]} × {sceneLabel(ad.scene)}</span>
      </div>
      <div className={`${CARD_FRAME} ${ad.status === "culled" ? "opacity-50 grayscale" : ""}`}>
        <AdCard product={product} variant={ad} />
      </div>
      <div className="flex flex-col gap-2 px-0.5 pt-0.5 text-[13px] tabular-nums">
        {ai && <RateBar rate={ai} band="bg-ai-mark" dot="bg-ai" />}
        <span>
          {survived(ad) && <span aria-hidden className="text-forest">▲ </span>}
          <span className="font-medium text-ai">AI</span> {ai ? fmtRate(ai) : "screening"}
        </span>
        {human ? (
          <>
            <RateBar rate={human} band="bg-pistachio" dot="bg-forest" />
            <span><span className="font-medium text-forest">People</span> {fmtRate(human)}</span>
          </>
        ) : (
          <span className="text-muted">Not tested with people yet</span>
        )}
      </div>
      <button type="button" onClick={onOpen} aria-label={`Details for “${ad.headline}”`} className="absolute inset-0 cursor-pointer rounded-[18px]" />
    </div>
  );
}
