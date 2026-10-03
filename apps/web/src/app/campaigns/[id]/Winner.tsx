import Link from "next/link";
import type { Campaign, Rate } from "@hack/contract";
import { AdCard } from "../../vote-lite/AdCard";
import { CARD_FRAME, RateBar } from "./AdTile";
import { allAds, findAd, firstCopies, fmtCtr, fmtRate, LEVER_LABEL, sceneLabel, STATUS_LABEL } from "./format";

/** The winning ad, AI vs people, its family (the parent and every sibling it beat) and the Meta export. */
export function Winner({ campaign, onOpen }: { campaign: Campaign; onOpen: (id: string) => void }) {
  const last = campaign.generations.at(-1);
  const win = campaign.winnerId ? findAd(campaign, campaign.winnerId, last?.gen) : undefined;
  if (!win) return null;
  const parent = win.parentIds[0] ? findAd(campaign, win.parentIds[0]) : undefined;
  const family = parent ? firstCopies(allAds(campaign).filter((a) => a.parentIds.includes(parent.id))) : [];
  const sealed = last?.sealedSha256;

  return (
    <section id="winner" aria-labelledby="winner-title" className="scroll-mt-6 pt-16">
      <h2 id="winner-title" className="e-h text-[44px] md:text-[72px]">
        The <span className="rounded-[14px] bg-pistachio px-[0.14em] [box-decoration-break:clone]">fittest</span> ad.
      </h2>
      <p className="mt-3.5 text-lg text-muted md:text-xl">
        Gen {win.gen}, {LEVER_LABEL[win.lever]}. {parent ? `A mutation of “${parent.headline.replace(/[.!?]+$/, "")}”.` : "An original from the upload."}
      </p>
      <div className="mt-9 flex flex-wrap items-start gap-10">
        <div className="e-pol min-w-0 flex-[0_1_420px]">
          <div className="flex items-center justify-between gap-2 px-0.5 pb-2.5 pt-0.5">
            <span className="e-lime rounded-full px-2.5 py-1 text-xs font-medium">Winner</span>
            <span className="text-right text-xs text-muted">{LEVER_LABEL[win.lever]} × {sceneLabel(win.scene)}</span>
          </div>
          <div className={CARD_FRAME}><AdCard product={campaign.product} variant={win} /></div>
        </div>
        <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-7">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
            <Stat name="AI shoppers" swatch="bg-ai-mark" rate={win.fitness.ai} band="bg-ai-mark" dot="bg-ai">
              {sealed ? <>P(tap), sealed as <span className="e-mono">{sealed.slice(0, 8)}</span> before people tested it.</> : "P(tap) from the AI shopper panel."}
            </Stat>
            <Stat name="People" swatch="bg-forest" rate={win.fitness.human} band="bg-[#7FB24E]" dot="bg-forest">
              Tap rate from real people.
            </Stat>
          </div>
          {win.experiment && (
            <p className="text-[15px]">
              <span className="font-medium">Simulated delivery:</span> CTR {fmtCtr(win.experiment)}. <span className="text-muted">Not real CTR.</span>
            </p>
          )}
          {parent && (
            <div className="flex flex-col gap-4">
              <span className="e-lbl">Family tree</span>
              <button type="button" onClick={() => onOpen(parent.id)} className="flex max-w-[520px] cursor-pointer items-center gap-3 rounded-xl text-left">
                <img src={parent.imageUrl ?? campaign.product.imageUrl} alt="" className="size-16 flex-none rounded-lg border border-line object-cover" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs text-muted">Gen {parent.gen} · {STATUS_LABEL[parent.status]}</span>
                  <span className="font-medium">{parent.headline}</span>
                  {parent.fitness.ai && <span className="text-xs text-muted">AI {fmtRate(parent.fitness.ai)}</span>}
                </span>
              </button>
              <span aria-hidden className="ml-8 h-5 w-px bg-ink/35" />
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3">
                {family.map((kid) => (
                  <li key={kid.id}>
                    <button type="button" onClick={() => onOpen(kid.id)} className="flex w-full cursor-pointer flex-col gap-1.5 rounded-lg text-left">
                      <img
                        src={kid.imageUrl ?? campaign.product.imageUrl}
                        alt=""
                        className={`aspect-square w-full rounded-lg object-cover ${kid.id === win.id ? "ring-2 ring-forest" : "border border-line"} ${kid.status === "culled" ? "opacity-50" : ""}`}
                      />
                      <span className="line-clamp-2 text-[13px] leading-snug">{kid.headline}</span>
                      <span className="text-xs text-muted">{STATUS_LABEL[kid.status]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            {/* Not in the contract (CSV fits no JSON fixture), so it only resolves in live mode. */}
            <a href={`/api/campaigns/${encodeURIComponent(campaign.id)}/meta.csv`} download className="e-pill e-lime min-h-[52px] text-sm">
              Export to Meta
            </a>
            <span className="text-sm text-muted">CSV for Meta Ads Manager bulk import</span>
            <Link href={`/watch-humans?c=${encodeURIComponent(campaign.id)}`} className="e-pill e-outline min-h-[52px] text-sm">
              Test with real people
            </Link>
            <span className="text-sm text-muted">Watch Humans members swipe on the finalists (concept demo)</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ name, swatch, rate, band, dot, children }: {
  name: string; swatch: string; rate: Rate | null; band: string; dot: string; children: React.ReactNode;
}) {
  return (
    <div className="e-tile flex flex-col gap-1.5 p-5">
      <span className="text-[15px] font-medium"><span aria-hidden className={`mr-2 inline-block size-2.5 ${swatch}`} />{name}</span>
      {rate?.rate != null ? (
        <>
          <span className="e-h text-[56px]">{Math.round(rate.rate * 100)}%</span>
          <span className="text-[15px] text-muted">{fmtRate(rate)}</span>
          <RateBar rate={rate} band={band} dot={dot} />
        </>
      ) : (
        <span className="e-h py-3 text-[32px] text-muted">Not tested yet</span>
      )}
      <span className="text-[13px] text-muted">{children}</span>
    </div>
  );
}
