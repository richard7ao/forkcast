"use client";
import { useEffect, useRef } from "react";
import type { Ad, Campaign } from "@hack/contract";
import { AdCard } from "../../vote-lite/AdCard";
import { CARD_FRAME } from "./AdTile";
import { allAds, findAd, firstCopies, fmtCtr, fmtRate, LEVER_LABEL, sceneLabel, STATUS_LABEL } from "./format";

const ROW = "border-t border-line py-2.5";
const DT = `${ROW} text-muted`;

/** Which ad to show: `gen` is the generation it was opened from; without it, the ad where it first appeared. */
export type OpenAd = { id: string; gen?: number } | null;

/** Ad details as a right-hand sheet. A native modal <dialog> gives Esc, focus trapping and an inert page for free. */
export function AdDrawer({ campaign, open, onOpen, onClose }: {
  campaign: Campaign; open: OpenAd; onOpen: (id: string) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const ad = open ? findAd(campaign, open.id, open.gen) : undefined;
  const shown = ad != null;
  const key = open ? `${open.gen}:${open.id}` : "";

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (shown && !dialog.open) dialog.showModal();
    if (!shown && dialog.open) dialog.close();
    dialog.scrollTop = 0;
  }, [key, shown]);

  const gen = open?.gen ?? ad?.gen;
  const parents = ad ? ad.parentIds.flatMap((id) => findAd(campaign, id) ?? []) : [];
  const children = ad ? firstCopies(allAds(campaign).filter((a) => a.parentIds.includes(ad.id))) : [];
  const sealed = campaign.generations.find((g) => g.gen === gen)?.sealedSha256;

  return (
    <dialog
      ref={ref}
      aria-labelledby="ad-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-0 ml-auto h-dvh max-h-none w-[min(440px,100%)] max-w-none overflow-y-auto rounded-l-3xl bg-white p-0 text-ink shadow-[-24px_0_60px_rgba(0,0,0,.16)] backdrop:bg-[rgb(29_29_29/0.1)]"
    >
      {ad && (
        <div className="flex min-h-full flex-col gap-5 px-7 py-6">
          <div className="flex items-center justify-between gap-3">
            <span className="e-lbl">Ad details</span>
            <button type="button" onClick={onClose} aria-label="Close ad details" className="grid size-11 flex-none cursor-pointer place-items-center rounded-full border border-ink/30 bg-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <h2 id="ad-title" className="e-h text-[32px]">{ad.headline}</h2>
          <div className={CARD_FRAME}><AdCard key={key} product={campaign.product} variant={ad} /></div>
          <dl className="grid grid-cols-[118px_minmax(0,1fr)] text-[15px] leading-snug">
            <dt className={DT}>Lever</dt><dd className={ROW}>{LEVER_LABEL[ad.lever]}</dd>
            <dt className={DT}>Scene</dt><dd className={ROW}>{sceneLabel(ad.scene)}</dd>
            <dt className={DT}>Generation</dt>
            <dd className={ROW}>Gen {gen} · {STATUS_LABEL[ad.status]}{ad.gen !== gen && `, carried over from Gen ${ad.gen}`}</dd>
            <dt className={DT}>Why this copy</dt><dd className={ROW}>{ad.rationale}</dd>
          </dl>
          <div className="flex flex-col gap-2.5">
            <span className="e-lbl">Lineage</span>
            <p className="text-[15px]">{parents.length ? "Parent:" : "Parents: none, an original from the upload."}</p>
            {parents.length > 0 && <Thumbs ads={parents} fallback={campaign.product.imageUrl} onOpen={onOpen} />}
            <p className="text-[15px]">{children.length ? `Children: ${children.length}` : "Children: none yet."}</p>
            {children.length > 0 && <Thumbs ads={children} fallback={campaign.product.imageUrl} onOpen={onOpen} />}
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="e-lbl">Evidence</span>
            <dl className="grid grid-cols-[118px_minmax(0,1fr)] text-[15px] leading-snug">
              <dt className={DT}><Swatch className="bg-ai-mark" />AI shoppers</dt>
              <dd className={ROW}>{ad.fitness.ai ? `P(tap) ${fmtRate(ad.fitness.ai)}` : "Screening"}</dd>
              <dt className={DT}>Simulated</dt>
              <dd className={ROW}>{ad.experiment ? `CTR ${fmtCtr(ad.experiment)}` : "Not run yet"}</dd>
              <dt className={DT}><Swatch className="bg-forest" />People</dt>
              <dd className={ROW}>{ad.fitness.human ? `Tap rate ${fmtRate(ad.fitness.human)}` : "Not tested yet"}</dd>
              <dt className={DT}>Sealed</dt>
              <dd className={ROW}>{sealed ? <>Gen {gen} sha256 <span className="e-mono">{sealed.slice(0, 8)}</span>, before people test</> : "Not sealed yet"}</dd>
            </dl>
            <p className="text-[13px] leading-normal text-muted">Simulated Meta-style delivery: budget shifts to the ads that win. Not real CTR.</p>
          </div>
          <details className="text-[13px] text-muted">
            <summary className="cursor-pointer">Render prompt</summary>
            <p className="mt-2 leading-normal">{ad.scene}</p>
          </details>
        </div>
      )}
    </dialog>
  );
}

const Swatch = ({ className }: { className: string }) => <span aria-hidden className={`mr-2 inline-block size-2.5 ${className}`} />;

function Thumbs({ ads, fallback, onOpen }: { ads: Ad[]; fallback: string; onOpen: (id: string) => void }) {
  return (
    <ul className="grid grid-cols-5 gap-2">
      {ads.map((a) => (
        <li key={a.id}>
          <button type="button" onClick={() => onOpen(a.id)} title={a.headline} aria-label={`Open “${a.headline}”`} className="block w-full cursor-pointer rounded-lg">
            <img src={a.imageUrl ?? fallback} alt="" className={`block aspect-square w-full rounded-lg border border-line object-cover ${a.status === "culled" ? "opacity-50" : ""}`} />
          </button>
        </li>
      ))}
    </ul>
  );
}
