import Link from "next/link";
import type { Campaign } from "@hack/contract";
import { AdCard } from "../../vote-lite/AdCard";
import { CARD_FRAME, RateBar } from "./AdTile";
import { allAds, findAd, firstCopies, fmtCtr, fmtRate, gensSurvived, LEVER_LABEL, median, sceneLabel, STATUS_LABEL } from "./format";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** The winner page: the winning ad, how far it beat its generation, its family (parent and siblings) and the Meta export. */
export function Winner({ campaign, onOpen }: { campaign: Campaign; onOpen: (id: string) => void }) {
  const last = campaign.generations.at(-1);
  const win = campaign.winnerId ? findAd(campaign, campaign.winnerId, last?.gen) : undefined;
  const back = `/campaigns/${encodeURIComponent(campaign.id)}`;
  if (!win || !last) return <NoWinner campaign={campaign} back={back} />;
  const parent = win.parentIds[0] ? findAd(campaign, win.parentIds[0]) : undefined;
  // The tree starts at the parent, or at the winner itself when it is an original that outlived its own children.
  const root = parent ?? win;
  const family = firstCopies(allAds(campaign).filter((a) => a.parentIds.includes(root.id)));
  const mid = median(last.ads.flatMap((a) => (a.experiment ? [a.experiment.ctr] : [])));
  const kept = gensSurvived(campaign, win.id);
  const ai = win.fitness.ai;

  return (
    <section aria-labelledby="winner-title" className="pt-12 md:pt-16">
      <Link href={back} className="e-mono text-[13px] uppercase tracking-[0.04em] text-muted hover:text-ink">← All ads</Link>
      <h1 id="winner-title" className="e-h fk-blur-in mt-4 text-[44px] md:text-[80px]">
        The <span className="rounded-[14px] bg-pistachio px-[0.14em] [box-decoration-break:clone]">fittest</span> ad
      </h1>
      <p className="mt-3.5 text-lg text-muted md:text-xl">
        Gen {last.gen}, {LEVER_LABEL[win.lever]} × {sceneLabel(win.scene)}. {parent ? `A mutation of “${parent.headline.replace(/[.!?]+$/, "")}”.` : "An original from the upload."}
      </p>
      <div className="mt-9 flex flex-wrap items-start gap-10">
        <div className="e-pol fk-crown min-w-0 flex-[1_1_380px] md:max-w-[480px]">
          <div className="flex items-center justify-between gap-2 px-0.5 pb-2.5 pt-0.5">
            <span className="e-lime rounded-full px-2.5 py-1 text-xs font-medium">Winner</span>
            <span className="text-right text-xs text-muted">{LEVER_LABEL[win.lever]} × {sceneLabel(win.scene)}</span>
          </div>
          <div className={CARD_FRAME}><AdCard product={campaign.product} variant={win} /></div>
        </div>
        <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-7">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-4">
            {win.experiment && (
              <Tile name="Simulated CTR" value={pct(win.experiment.ctr)}>
                {mid != null && <>vs {pct(mid)} median across Gen {last.gen}&apos;s {last.ads.length} ads{mid > 0 && ` · ${(win.experiment.ctr / mid).toFixed(1)}×`}</>}
              </Tile>
            )}
            {ai?.rate != null && (
              <Tile name="AI shoppers" value={`${Math.round(ai.rate * 100)}%`}>
                P(tap) {fmtRate(ai)}
                <span className="mt-2 block"><RateBar rate={ai} band="bg-ai-mark" dot="bg-ai" /></span>
              </Tile>
            )}
            <Tile name="Generations survived" value={String(kept)}>
              Kept by the cull in {kept === 1 ? "1 generation" : `${kept} generations`} of {campaign.generations.length}
            </Tile>
          </div>
          {win.experiment && <p className="text-[15px]"><span className="font-medium">Simulated</span> CTR {fmtCtr(win.experiment)}</p>}
          {family.length > 0 && (
            <div className="flex flex-col gap-4">
              <span className="e-lbl">Family</span>
              <button type="button" onClick={() => onOpen(root.id)} className="flex max-w-[520px] cursor-pointer items-center gap-3 rounded-xl text-left">
                <img src={root.imageUrl ?? campaign.product.imageUrl} alt="" className="size-16 flex-none rounded-lg border border-line object-cover" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs text-muted">{root === win ? "The winner" : "Parent"} · Gen {root.gen} · {STATUS_LABEL[root.status]}</span>
                  <span className="font-medium">{root.headline}</span>
                  {root.fitness.ai && <span className="text-xs text-muted">AI shoppers {fmtRate(root.fitness.ai)}</span>}
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
                        className={`aspect-square w-full rounded-lg object-cover ${kid.id === win.id ? "ring-2 ring-forest" : "border border-line"} ${kid.status === "culled" ? "opacity-50 grayscale" : ""}`}
                      />
                      <span className="line-clamp-2 text-[13px] leading-snug">{kid.headline}</span>
                      <span className="text-xs text-muted">{kid.id === win.id ? "Winner" : STATUS_LABEL[kid.status]}</span>
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
            <Link href={back} className="e-pill e-outline min-h-[52px] text-sm">Back to all ads</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Tile({ name, value, children }: { name: string; value: string; children: React.ReactNode }) {
  return (
    <div className="e-tile flex flex-col gap-1.5 p-5">
      <span className="text-[15px] font-medium">{name}</span>
      <span className="e-h text-[48px] md:text-[56px]">{value}</span>
      <span className="text-[13px] text-muted">{children}</span>
    </div>
  );
}

/** Explains the step that produces a winner: only a bred generation (Gen 1 on) crowns one. */
function NoWinner({ campaign, back }: { campaign: Campaign; back: string }) {
  const last = campaign.generations.at(-1);
  const running = campaign.stage !== "done" && campaign.stage !== "error";
  const next = running
    ? `Generation ${campaign.generations.length} is still running. Its fittest ad is crowned here when it finishes.`
    : !last
      ? "No generation has finished yet."
      : `Gen ${last.gen} kept ${last.survivorIds.length} survivors. Breed them into Gen ${last.gen + 1} (admin), and its fittest ad is crowned here.`;
  return (
    <section aria-labelledby="winner-title" className="pt-12 md:pt-16">
      <h1 id="winner-title" className="e-h text-[44px] md:text-[72px]">No winner yet</h1>
      <p className="mt-3.5 max-w-[640px] text-lg text-muted md:text-xl">{next}</p>
      <Link href={back} className="e-pill e-lime mt-8 min-h-[52px]">Back to all ads</Link>
    </section>
  );
}
