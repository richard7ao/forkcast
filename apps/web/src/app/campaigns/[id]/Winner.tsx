import Link from "next/link";
import type { Ad, Campaign, Generation } from "@hack/contract";
import { AdCard } from "../../vote-lite/AdCard";
import { CARD_FRAME, RateBar } from "./AdTile";
import { adHref, allAds, byFitness, findAd, firstCopies, fmtCtr, fmtRate, gensSurvived, LEVER_LABEL, median, sceneLabel, SEGMENTS } from "./format";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const SEGMENT_LABEL: Record<(typeof SEGMENTS)[number], string> = { student: "Student", young_pro: "Young pro", parent: "Parent", fitness: "Fitness" };
const STATUS: Record<Ad["status"], string> = { winner: "Winner", survivor: "Survivor", culled: "Cut", screening: "Screening" };

/** /winner: the winner's performance page, or the step that still has to run before there is one. */
export function Winner({ campaign }: { campaign: Campaign }) {
  const last = campaign.generations.at(-1);
  const win = campaign.winnerId ? findAd(campaign, campaign.winnerId, last?.gen) : undefined;
  return win && last ? <AdReport campaign={campaign} ad={win} gen={last} /> : <NoWinner campaign={campaign} />;
}

/**
 * How one ad performed in one generation: its rank, simulated CTR against the generation median, the AI shoppers by
 * audience, its family, and links to the ads ranked either side of it.
 */
export function AdReport({ campaign, ad, gen }: { campaign: Campaign; ad: Ad; gen: Generation }) {
  const back = `/campaigns/${encodeURIComponent(campaign.id)}`;
  const order = [...gen.ads].sort(byFitness);
  const at = order.findIndex((a) => a.id === ad.id);
  const [prev, next] = [order[at - 1], order[at + 1]];
  const isWin = ad.status === "winner";
  const parent = ad.parentIds[0] ? findAd(campaign, ad.parentIds[0]) : undefined;
  // The tree starts at the parent, or at the ad itself when it is an original: then it shows the ad's own children.
  const root = parent ?? ad;
  const family = firstCopies(allAds(campaign).filter((a) => a.parentIds.includes(root.id)));
  const mid = median(gen.ads.flatMap((a) => (a.experiment ? [a.experiment.ctr] : [])));
  const kept = gensSurvived(campaign, ad.id);
  const ai = ad.fitness.ai;
  const segs = SEGMENTS.flatMap((s) => (ad.fitness.aiBySegment?.[s] != null ? [[s, ad.fitness.aiBySegment[s]!] as const] : []));
  const link = (a: Ad) => adHref(campaign.id, a.id, gen.gen);

  return (
    <section aria-labelledby="ad-title" className="pt-12 md:pt-16">
      <nav className="e-mono flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] uppercase tracking-[0.04em] text-muted">
        <Link href={back} className="hover:text-ink">← All ads</Link>
        <span className="ml-auto flex gap-5">
          {prev && <Link href={link(prev)} className="hover:text-ink">← #{at}</Link>}
          {next && <Link href={link(next)} className="hover:text-ink">#{at + 2} →</Link>}
        </span>
      </nav>
      <h1 id="ad-title" className="e-h fk-blur-in mt-4 text-[44px] md:text-[80px]">
        {isWin ? (
          <>The <span className="rounded-[14px] bg-pistachio px-[0.14em] [box-decoration-break:clone]">fittest</span> ad</>
        ) : (
          <>#{at + 1} of {gen.ads.length} in Gen {gen.gen}</>
        )}
      </h1>
      <p className="mt-3.5 text-lg text-muted md:text-xl">
        Gen {gen.gen}, {LEVER_LABEL[ad.lever]} × {sceneLabel(ad.scene)}. {parent ? `A mutation of “${parent.headline.replace(/[.!?]+$/, "")}”.` : "An original from the upload."}
      </p>
      <div className="mt-9 flex flex-wrap items-start gap-10">
        <div className={`e-pol min-w-0 flex-[1_1_380px] md:max-w-[480px] ${isWin ? "fk-crown" : ""}`}>
          <div className="flex items-center justify-between gap-2 px-0.5 pb-2.5 pt-0.5">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ad.status === "culled" || ad.status === "screening" ? "border border-ink/35 text-muted" : "e-lime"}`}>{STATUS[ad.status]}</span>
            <span className="text-right text-xs text-muted">{LEVER_LABEL[ad.lever]} × {sceneLabel(ad.scene)}</span>
          </div>
          <div className={CARD_FRAME}><AdCard key={`${gen.gen}:${ad.id}`} product={campaign.product} variant={ad} /></div>
        </div>
        <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-7">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-4">
            {ad.experiment && (
              <Tile name="Simulated CTR" value={pct(ad.experiment.ctr)}>
                {mid != null && <>vs {pct(mid)} median across Gen {gen.gen}&apos;s {gen.ads.length} ads{mid > 0 && ` · ${(ad.experiment.ctr / mid).toFixed(1)}×`}</>}
              </Tile>
            )}
            {ai?.rate != null && (
              <Tile name="AI shoppers" value={`${Math.round(ai.rate * 100)}%`}>
                P(tap) {fmtRate(ai)}
                <span className="mt-2 block"><RateBar rate={ai} band="bg-ai-mark" dot="bg-ai" /></span>
              </Tile>
            )}
            <Tile name="Rank" value={`#${at + 1}`}>
              of {gen.ads.length} in Gen {gen.gen} · survived {kept === 1 ? "1 generation" : `${kept} generations`}
            </Tile>
          </div>
          {ad.experiment && <p className="text-[15px]"><span className="font-medium">Simulated</span> CTR {fmtCtr(ad.experiment)}</p>}
          {segs.length > 0 && (
            <div className="flex flex-col gap-3">
              <span className="e-lbl">AI shoppers by audience</span>
              {segs.map(([s, p]) => (
                <div key={s} className="grid grid-cols-[88px_minmax(0,1fr)_44px] items-center gap-3 text-[15px] tabular-nums">
                  <span>{SEGMENT_LABEL[s]}</span>
                  <span aria-hidden className="h-2.5 rounded-full bg-track"><span className="block h-full rounded-full bg-ai-mark" style={{ width: `${p * 100}%` }} /></span>
                  <span className="text-right">{Math.round(p * 100)}%</span>
                </div>
              ))}
            </div>
          )}
          {family.length > 0 && (
            <div className="flex flex-col gap-4">
              <span className="e-lbl">Family</span>
              <Link href={adHref(campaign.id, root.id)} className="flex max-w-[520px] items-center gap-3 rounded-xl text-left">
                <img src={root.imageUrl ?? campaign.product.imageUrl} alt="" className="size-16 flex-none rounded-lg border border-line object-cover" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs text-muted">{root === ad ? "This ad" : "Parent"} · Gen {root.gen} · {STATUS[root.status]}</span>
                  <span className="font-medium">{root.headline}</span>
                  {root.fitness.ai && <span className="text-xs text-muted">AI shoppers {fmtRate(root.fitness.ai)}</span>}
                </span>
              </Link>
              <span aria-hidden className="ml-8 h-5 w-px bg-ink/35" />
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3">
                {family.map((kid) => (
                  <li key={kid.id}>
                    <Link href={adHref(campaign.id, kid.id, kid.gen)} className="flex w-full flex-col gap-1.5 rounded-lg text-left">
                      <img
                        src={kid.imageUrl ?? campaign.product.imageUrl}
                        alt=""
                        className={`aspect-square w-full rounded-lg object-cover ${kid.id === ad.id ? "ring-2 ring-forest" : "border border-line"}`}
                      />
                      <span className="line-clamp-2 text-[13px] leading-snug">{kid.headline}</span>
                      <span className="text-xs text-muted">{kid.id === ad.id ? "This ad" : STATUS[kid.status]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            {isWin && (
              <>
                {/* Not in the contract (CSV fits no JSON fixture), so it only resolves in live mode. */}
                <a href={`/api/campaigns/${encodeURIComponent(campaign.id)}/meta.csv`} download className="e-pill e-lime min-h-[52px] text-sm">
                  Export to Meta
                </a>
                <span className="text-sm text-muted">CSV for Meta Ads Manager bulk import</span>
              </>
            )}
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
function NoWinner({ campaign }: { campaign: Campaign }) {
  const last = campaign.generations.at(-1);
  const running = campaign.stage !== "done" && campaign.stage !== "error";
  const next = running
    ? `Generation ${campaign.generations.length} is still running. Its fittest ad is crowned here when it finishes.`
    : !last
      ? "No generation has finished yet."
      : `Gen ${last.gen} kept ${last.survivorIds.length} survivors. Breed them into Gen ${last.gen + 1}, and its fittest ad is crowned here.`;
  return (
    <section aria-labelledby="ad-title" className="pt-12 md:pt-16">
      <h1 id="ad-title" className="e-h text-[44px] md:text-[72px]">No winner yet</h1>
      <p className="mt-3.5 max-w-[640px] text-lg text-muted md:text-xl">{next}</p>
      <Link href={`/campaigns/${encodeURIComponent(campaign.id)}`} className="e-pill e-lime mt-8 min-h-[52px]">Back to all ads</Link>
    </section>
  );
}
