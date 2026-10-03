"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import type { Ad, Campaign, Generation } from "@hack/contract";
import { AdCard } from "../../vote-lite/AdCard";
import { CARD_FRAME, RateBar } from "./AdTile";
import { adHref, allAds, ctrBenchmarks, findAd, firstCopies, fmtRate, gensSurvived, LEVER_LABEL, percentile, rankAds, sceneLabel, SEGMENTS, winnerOf } from "./format";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const n = (x: number) => x.toLocaleString("en-GB");
const SEGMENT_LABEL: Record<(typeof SEGMENTS)[number], string> = { student: "Student", young_pro: "Young pro", parent: "Parent", fitness: "Fitness" };
const STATUS: Record<Ad["status"], string> = { winner: "Winner", survivor: "Survivor", culled: "Cut", screening: "Screening" };
/** Sections fade up one after another (globals.css fk-pop). */
const fade = (i: number) => ({ "--d": `${i * 70}ms` }) as CSSProperties;

/** /winner: the crowned winner, or until a bred generation crowns one, the #1 ad of the latest ranked generation. */
export function Winner({ campaign }: { campaign: Campaign }) {
  const w = winnerOf(campaign);
  return w ? <AdReport campaign={campaign} ad={w.ad} gen={w.gen} best /> : <NoWinner campaign={campaign} />;
}

/**
 * How one ad performed in one generation: rank, simulated CTR against its generation, delivery, the AI shoppers, its
 * lineage and family, and links to the ads ranked either side of it. `best`: shown as the winner page's pick.
 */
export function AdReport({ campaign, ad, gen, best = false }: { campaign: Campaign; ad: Ad; gen: Generation; best?: boolean }) {
  const back = `/campaigns/${encodeURIComponent(campaign.id)}`;
  const order = rankAds(gen.ads);
  const at = order.findIndex((a) => a.id === ad.id);
  const [prev, next] = [order[at - 1], order[at + 1]];
  const isWin = ad.status === "winner";
  const crown = isWin || best;
  const parent = ad.parentIds[0] ? findAd(campaign, ad.parentIds[0]) : undefined;
  // The tree starts at the parent, or at the ad itself when it is an original: then it shows the ad's own children.
  const root = parent ?? ad;
  const family = firstCopies(allAds(campaign).filter((a) => a.parentIds.includes(root.id)));
  const children = firstCopies(allAds(campaign).filter((a) => a.parentIds.includes(ad.id)));
  const kept = gensSurvived(campaign, ad.id);
  const ai = ad.fitness.ai;
  // Per-segment counts are not in the contract; the panel deals every ad evenly across its 4 segments.
  const segN = ai ? Math.round(ai.n / SEGMENTS.length) : 0;
  const segs = SEGMENTS.flatMap((s) => (ad.fitness.aiBySegment?.[s] != null ? [[s, ad.fitness.aiBySegment[s]!] as const] : []));
  const x = ad.experiment;
  const bench = ctrBenchmarks(ad, gen);
  const bars = x
    ? ([["This ad", x.ctr], [`Gen ${gen.gen} median`, bench.median], [`${LEVER_LABEL[ad.lever]} average`, bench.lever], ["Same scene average", bench.scene]] as const)
        .flatMap(([label, v]) => (v == null ? [] : [{ label, v }]))
    : [];
  const barTop = Math.max(1e-9, ...bars.map((b) => b.v));
  const series = gen.timeline.map((t) => t.impressionsByAd[ad.id] ?? 0);
  const budget = Object.values(gen.timeline.at(-1)?.impressionsByAd ?? {}).reduce((s, v) => s + v, 0);
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
        {crown ? (
          <>The <span className="rounded-[14px] bg-pistachio px-[0.14em] [box-decoration-break:clone]">fittest</span> ad{!isWin && " so far"}</>
        ) : (
          <>#{at + 1} of {gen.ads.length} in Gen {gen.gen}</>
        )}
      </h1>
      <p className="mt-3.5 text-lg text-muted md:text-xl">
        Gen {gen.gen}, {LEVER_LABEL[ad.lever]} × {sceneLabel(ad.scene)}. {parent ? `A mutation of “${parent.headline.replace(/[.!?]+$/, "")}”.` : "An original from the upload."}
      </p>
      <div className="mt-9 flex flex-wrap items-start gap-10">
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4 md:max-w-[480px]">
          <div className={`e-pol ${crown ? "fk-crown" : ""}`}>
            <div className="flex items-center justify-between gap-2 px-0.5 pb-2.5 pt-0.5">
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ad.status === "culled" || ad.status === "screening" ? "border border-ink/35 text-muted" : "e-lime"}`}>{STATUS[ad.status]}</span>
              <span className="text-right text-xs text-muted">{LEVER_LABEL[ad.lever]} × {sceneLabel(ad.scene)}</span>
            </div>
            <div className={CARD_FRAME}><AdCard key={`${gen.gen}:${ad.id}`} product={campaign.product} variant={ad} /></div>
          </div>
          <dl className="e-tile fk-pop grid gap-3 p-5 text-[15px]" style={fade(1)}>
            {([["Headline", ad.headline], ["Body", ad.body], ["CTA", ad.cta]] as const).map(([k, v]) => (
              <div key={k}>
                <dt className="e-mono text-[12px] uppercase tracking-[0.04em] text-muted">{k}</dt>
                <dd className={k === "Headline" ? "font-medium" : ""}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-6">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(210px,100%),1fr))] gap-4">
            {x && (
              <Tile i={0} name="Simulated CTR" value={pct(x.ctr)}>
                Interval {pct(x.lo)}–{pct(x.hi)}{bench.median ? ` · ${(x.ctr / bench.median).toFixed(1)}× the Gen ${gen.gen} median` : ""}
              </Tile>
            )}
            <Tile i={1} name="Rank" value={`#${at + 1}`}>
              of {gen.ads.length} in Gen {gen.gen} · {percentile(at + 1, gen.ads.length)} percentile
            </Tile>
            {x && budget > 0 && (
              <Tile i={2} name="Delivery" value={pct(x.impressions / budget)}>
                of the {n(budget)}-impression budget · {n(x.impressions)} impressions · {n(x.clicks)} clicks
                <Sparkline series={series} />
              </Tile>
            )}
            {ai?.rate != null && (
              <Tile i={3} name="AI shoppers" value={`${Math.round(ai.rate * 100)}%`}>
                {ai.taps} of {ai.n} tapped · P(tap) {fmtRate(ai)}
                <span className="mt-2 block"><RateBar rate={ai} band="bg-ai-mark" dot="bg-ai" /></span>
              </Tile>
            )}
            <Tile i={4} name="Lineage" value={STATUS[ad.status]}>
              Survived {kept === 1 ? "1 generation" : `${kept} generations`} ·{" "}
              {parent ? <>child of <Link href={adHref(campaign.id, parent.id)} className="underline underline-offset-2 hover:text-ink">{parent.headline}</Link></> : "an original"}
              {" · "}{children.length === 1 ? "1 child" : `${children.length} children`}
            </Tile>
          </div>
          {bars.length > 0 && (
            <div className="e-tile fk-pop flex flex-col gap-3 p-5" style={fade(5)}>
              <span className="e-lbl">Simulated CTR vs benchmarks</span>
              {bars.map(({ label, v }, i) => (
                <div key={label} className="grid grid-cols-[minmax(0,160px)_minmax(0,1fr)_52px] items-center gap-3 text-[15px] tabular-nums">
                  <span className={`truncate ${i ? "text-muted" : "font-medium"}`}>{label}</span>
                  <span aria-hidden className="h-2.5 rounded-full bg-track"><span className={`block h-full rounded-full ${i ? "bg-ink/25" : "bg-forest"}`} style={{ width: `${(v / barTop) * 100}%` }} /></span>
                  <span className="text-right">{pct(v)}</span>
                </div>
              ))}
            </div>
          )}
          {segs.length > 0 && (
            <div className="e-tile fk-pop flex flex-col gap-3 p-5" style={fade(6)}>
              <span className="e-lbl">AI shoppers by audience</span>
              {segs.map(([s, p]) => (
                <div key={s} className="grid grid-cols-[88px_minmax(0,1fr)_44px_48px] items-center gap-3 text-[15px] tabular-nums">
                  <span>{SEGMENT_LABEL[s]}</span>
                  <span aria-hidden className="h-2.5 rounded-full bg-track"><span className="block h-full rounded-full bg-ai-mark" style={{ width: `${p * 100}%` }} /></span>
                  <span className="text-right">{Math.round(p * 100)}%</span>
                  <span className="text-right text-[13px] text-muted">n≈{segN}</span>
                </div>
              ))}
            </div>
          )}
          {family.length > 0 && (
            <div className="fk-pop flex flex-col gap-4" style={fade(7)}>
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
            <Iterate campaignId={campaign.id} adId={ad.id} />
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

/**
 * Breeds a new generation of 5 from this one ad: the ad plus 4 variations. On success the campaign page shows the run.
 * ponytail: plain fetch, the iterate route is not in the frozen contract; add it there to go through fetchTyped.
 */
function Iterate({ campaignId, adId }: { campaignId: string; adId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setFailure(null);
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/ads/${encodeURIComponent(adId)}/iterate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (res.status === 409) throw new Error("Busy, another run is going");
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? `Iterate failed (${res.status}).`);
      router.push(`/campaigns/${encodeURIComponent(campaignId)}`);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return (
    <span className="flex flex-col items-start gap-1.5">
      <button type="button" onClick={() => void go()} disabled={busy} className="e-pill e-lime min-h-[52px] text-sm">
        {busy ? "Iterating…" : "Iterate on this ad ↻"}
      </button>
      {failure && <span role="alert" className="text-[13px] text-bad">{failure}</span>}
    </span>
  );
}

function Tile({ i, name, value, children }: { i: number; name: string; value: string; children: ReactNode }) {
  return (
    <div className="e-tile fk-pop flex min-w-0 flex-col gap-1.5 p-5" style={fade(i)}>
      <span className="text-[15px] font-medium">{name}</span>
      <span className="e-h break-words text-[40px] leading-none md:text-[48px]">{value}</span>
      <span className="text-[13px] text-muted">{children}</span>
    </div>
  );
}

/** Cumulative impressions at each rollout snapshot: a steepening line is budget flowing in, a flat one drying up. */
function Sparkline({ series }: { series: number[] }) {
  const top = Math.max(1, ...series);
  const pts = series.map((v, i) => `${((i / Math.max(1, series.length - 1)) * 100).toFixed(1)},${(31 - (v / top) * 29).toFixed(1)}`).join(" ");
  return (
    <span className="mt-3 block">
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden className="block h-10 w-full text-forest">
        <polygon points={`0,32 ${pts} 100,32`} fill="currentColor" opacity={0.12} />
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="mt-1 block text-[12px]">Impressions over the rollout</span>
    </span>
  );
}

/** Before any generation is ranked there is no ad to show yet. */
function NoWinner({ campaign }: { campaign: Campaign }) {
  const running = campaign.stage !== "done" && campaign.stage !== "error";
  return (
    <section aria-labelledby="ad-title" className="pt-12 md:pt-16">
      <h1 id="ad-title" className="e-h text-[44px] md:text-[72px]">{running ? "Gen 0 is screening" : "Nothing ranked yet"}</h1>
      <p className="mt-3.5 max-w-[640px] text-lg text-muted md:text-xl">
        {running ? "The fittest ad lands here as soon as Gen 0's rollout is ranked." : "This run stopped before any ad was ranked."}
      </p>
      <Link href={`/campaigns/${encodeURIComponent(campaign.id)}`} className="e-pill e-lime mt-8 min-h-[52px]">Back to all ads</Link>
    </section>
  );
}
