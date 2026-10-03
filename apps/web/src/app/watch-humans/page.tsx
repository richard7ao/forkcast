"use client";

/**
 * /watch-humans: concept demo of Forkcast inside Watch Humans, Really Good Culture's app that sends
 * members free products to review on video. Before a free sample ships, the member swipes on the brand's
 * finalist ads, and every swipe is real human fitness for the experiment. Left: the member's phone.
 * Right: what the brand sees in Forkcast. ?c=<campaign id> picks the campaign (default demo-epic).
 * Styled in direction E (light), like the brand pages.
 *
 * Decisions made without asking:
 * - The deck is the last generation's survivors and winner (./swipe): the AI screen narrows the field,
 *   and people judge only the finalists.
 * - Each member gets a fresh shuffle, so the AI's winner is not always first.
 * - The sample card shows pack facts, not a photo: every photo we have is either an ad under test (it
 *   would prime the swipes) or the raw upload (bystanders' hands).
 * - Both answer buttons share one neutral style, as in /vote-lite: a louder one would bias the swipe.
 * - Swipes stay in this tab; nothing is sent or stored. ponytail: POST them to a /campaigns/:id/swipes
 *   route that fills fitness.human once real members swipe.
 */
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Ad, Campaign, Product } from "@hack/contract";
import { Logo } from "../../components/Logo";
import { ErrorNote, Skeleton } from "../../components/ui";
import { useEndpoint } from "../../lib/useEndpoint";
import { LEVER_LABEL } from "../campaigns/[id]/format";
import { AdCard } from "../vote-lite/AdCard";
import { shuffleSeeded } from "../vote-lite/lite";
import m from "./motion.module.css";
import { finalists, humanLeader, record, swipeDirection, SWIPE_PX, type Tally } from "./swipe";

type Stage = "offer" | "deck" | "claimed";

/** How long a decided card takes to fly off-screen; matches .fly in motion.module.css. */
const FLY_MS = 280;
const WRAP = "mx-auto w-full max-w-[1180px] px-4 md:px-8";
const PRIMARY_BTN = "e-pill e-lime min-h-[52px] w-full touch-manipulation select-none text-sm transition-transform hover:-translate-y-0.5 active:scale-[0.98]";
const ANSWER_BTN = "e-pill min-h-[52px] flex-1 touch-manipulation select-none border-ink/30 bg-white text-ink transition-colors hover:bg-[#F4F4F1]";
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default function WatchHumansPage() {
  // useSearchParams needs a Suspense boundary when Next prerenders the page.
  return (
    <Suspense>
      <Demo />
    </Suspense>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-e pb-16">
      <header className="border-b border-line">
        <div className={`${WRAP} flex items-center justify-between gap-4 py-[18px]`}>
          <Logo />
          <span className="e-lbl">Concept demo</span>
        </div>
      </header>
      {children}
    </div>
  );
}

function Demo() {
  const id = useSearchParams().get("c") ?? "demo-epic";
  const { data, error, reload } = useEndpoint("campaign", { params: { id } });
  if (error) {
    return (
      <Shell>
        <main className="mx-auto max-w-md space-y-4 px-4 py-10">
          <p className="text-lg font-medium">Could not load campaign &quot;{id}&quot;.</p>
          <ErrorNote error={error} />
          <button type="button" onClick={() => reload()} className={PRIMARY_BTN}>
            Try again
          </button>
        </main>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <main className="mx-auto max-w-md px-4 py-10">
          <Skeleton rows={6} />
        </main>
      </Shell>
    );
  }
  return <Integration campaign={data.campaign} />;
}

function Integration({ campaign }: { campaign: Campaign }) {
  const ads = finalists(campaign);
  const [stage, setStage] = useState<Stage>("offer");
  const [claimed, setClaimed] = useState(0);
  const [tally, setTally] = useState<Tally>({});

  return (
    <Shell>
      <main className={`${WRAP} grid gap-8 pt-10 md:grid-cols-[minmax(0,400px)_minmax(0,1fr)] md:items-start md:pt-14`}>
        <h1 className={`e-h text-[40px] md:col-span-2 md:text-[56px] ${m.rise}`}>Forkcast inside Watch Humans</h1>
        <section
          aria-label="A member's phone"
          className={`flex min-h-[640px] flex-col overflow-hidden rounded-[32px] border border-edge bg-white p-5 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_24px_60px_-28px_rgb(0_0_0/0.3)] ${m.rise}`}
          style={{ animationDelay: "80ms" }}
        >
          {stage === "offer" && <Offer product={campaign.product} count={ads.length} onStart={() => setStage("deck")} />}
          {stage === "deck" && (
            <SwipeDeck
              ads={ads}
              product={campaign.product}
              onSwipe={(adId, tapped) => setTally((t) => record(t, adId, tapped))}
              onDone={() => {
                setClaimed((n) => n + 1);
                setStage("claimed");
              }}
            />
          )}
          {stage === "claimed" && <Claimed product={campaign.product} onNext={() => setStage("offer")} />}
        </section>
        <BrandView campaign={campaign} ads={ads} claimed={claimed} tally={tally} />
      </main>
    </Shell>
  );
}

function Offer({ product, count, onStart }: { product: Product; count: number; onStart: () => void }) {
  // Short facts read as chips; long ones (the pack slogan) would wrap into paragraphs.
  const chips = product.facts.filter((fact) => fact.length <= 24).slice(0, 4);
  return (
    <div className={`my-auto space-y-6 ${m.rise}`}>
      <p className="e-lbl">Watch Humans · your next box</p>
      <div className="e-tile space-y-3 p-5">
        <p className="text-sm text-muted">{product.brand}</p>
        <h2 className="e-h text-[30px]">{product.name}</h2>
        <ul className="flex flex-wrap gap-2">
          {chips.map((fact) => (
            <li key={fact} className="rounded-full border border-edge px-3 py-1 text-sm">
              {fact}
            </li>
          ))}
        </ul>
        <p className="w-fit rounded-full bg-pistachio px-3 py-1 text-sm font-medium">Free sample</p>
      </div>
      {count > 0 ? (
        <>
          <p className="text-[17px] leading-relaxed">
            Before it ships, swipe through {count} ads {product.brand} is testing: right if you would tap the ad, left if
            you would scroll past.
          </p>
          <button type="button" onClick={onStart} className={PRIMARY_BTN}>
            Swipe to claim
          </button>
        </>
      ) : (
        <p className="text-muted">No finalists yet: this campaign is still running.</p>
      )}
    </div>
  );
}

function SwipeDeck({ ads, product, onSwipe, onDone }: {
  ads: Ad[]; product: Product; onSwipe: (adId: string, tapped: boolean) => void; onDone: () => void;
}) {
  // A fresh order per member, so the AI's winner is not always first.
  const [deck] = useState(() => shuffleSeeded(ads, Math.random().toString(36)));
  const [i, setI] = useState(0);
  const [drag, setDrag] = useState<{ x0: number; dx: number } | null>(null);
  // Set while a decided card flies off-screen; answers are ignored until the next card is up.
  const [fly, setFly] = useState<"left" | "right" | null>(null);
  const card = deck[i];

  const answer = (tapped: boolean) => {
    if (!card || fly) return;
    onSwipe(card.id, tapped);
    const next = () => {
      setFly(null);
      setDrag(null);
      if (i + 1 < deck.length) setI(i + 1);
      else onDone();
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return next();
    setFly(tapped ? "right" : "left");
    setTimeout(next, FLY_MS);
  };

  // Re-bound every render so the handler always sees the current card. Held keys repeat: ignore repeats.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "ArrowRight") answer(true);
      if (e.key === "ArrowLeft") answer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!card) return null;
  const dx = drag?.dx ?? 0;
  // The stamp shows the drag, or the decision while the card flies.
  const lean = fly ? (fly === "right" ? SWIPE_PX : -SWIPE_PX) : dx;
  const sign = fly === "right" ? 1 : -1;
  return (
    <>
      <div className="mb-4 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="e-h text-[22px]">Finalist {i + 1} of {deck.length}</h2>
          <span className="e-lbl">Member test</span>
        </div>
        <div aria-hidden className="flex gap-1">
          {deck.map((ad, k) => (
            <span key={ad.id} className={`h-1 flex-1 rounded-full ${m.ease} ${k < i ? "bg-forest" : k === i ? "bg-ink" : "bg-ink/12"}`} />
          ))}
        </div>
      </div>
      <div
        key={card.id}
        className={`relative cursor-grab touch-pan-y select-none active:cursor-grabbing ${drag ? "" : fly ? m.fly : m.spring}`}
        style={
          fly
            ? { transform: `translateX(${sign * 150}%) rotate(${sign * 22}deg)`, opacity: 0 }
            : { transform: `translateX(${dx}px) rotate(${dx / 24}deg)` }
        }
        onPointerDown={(e) => {
          if (fly) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ x0: e.clientX, dx: 0 });
        }}
        onPointerMove={(e) => {
          if (drag) setDrag({ x0: drag.x0, dx: e.clientX - drag.x0 });
        }}
        onPointerUp={() => {
          const direction = swipeDirection(dx);
          setDrag(null);
          if (direction) answer(direction === "right");
        }}
        onPointerCancel={() => setDrag(null)}
        onDragStart={(e) => e.preventDefault()}
      >
        <div className={`e-pol p-2 ${m.enter}`}>
          <div className="overflow-hidden rounded-xl shadow-[0_0_0_1px_rgba(0,0,0,.06),0_1px_2px_rgba(0,0,0,.10)]">
            <AdCard product={product} variant={card} />
          </div>
        </div>
        {lean !== 0 && (
          <span
            className={`e-mono absolute top-24 rounded-lg border-[1.5px] border-ink px-3 py-1 text-[13px] font-semibold uppercase tracking-[0.04em] text-ink shadow-[0_4px_10px_rgb(29_29_29/0.18)] ${lean > 0 ? "left-4 rotate-[-10deg] bg-pistachio" : "right-4 rotate-[10deg] bg-white"}`}
            style={{ opacity: Math.min(1, Math.abs(lean) / SWIPE_PX) }}
          >
            {lean > 0 ? "Would tap" : "Scroll past"}
          </span>
        )}
      </div>
      <p className="mt-4 text-center text-[13px] text-muted">Swipe right to tap, left to scroll past, or use the buttons or arrow keys.</p>
      <div className="mt-auto flex gap-3 pt-4">
        <button type="button" onClick={() => answer(false)} className={ANSWER_BTN}>
          Scroll past
        </button>
        <button type="button" onClick={() => answer(true)} className={ANSWER_BTN}>
          Would tap
        </button>
      </div>
    </>
  );
}

function Claimed({ product, onNext }: { product: Product; onNext: () => void }) {
  return (
    <div className={`my-auto space-y-5 text-center ${m.rise}`}>
      <h2 className="e-h text-[40px]">Sample claimed.</h2>
      <p className="text-lg text-muted">
        {product.name} is in your next Watch Humans box. When it arrives, film your video review.
      </p>
      <p className="text-sm text-muted">Your swipes are already in {product.brand}&apos;s experiment.</p>
      <button type="button" onClick={onNext} className={PRIMARY_BTN}>
        Next member
      </button>
    </div>
  );
}

function BrandView({ campaign, ads, claimed, tally }: { campaign: Campaign; ads: Ad[]; claimed: number; tally: Tally }) {
  const made = new Set(campaign.generations.flatMap((g) => g.ads.map((ad) => ad.id))).size;
  const aiPick = ads.find((ad) => ad.id === campaign.winnerId);
  const membersPick = humanLeader(ads, tally);
  const swiped = Object.keys(tally).length > 0;
  return (
    <section aria-label="What the brand sees" className={`e-tile space-y-8 p-6 md:p-8 ${m.rise}`} style={{ animationDelay: "160ms" }}>
      <div className="space-y-4">
        <h2 className="e-h text-[30px] md:text-[36px]">What {campaign.product.brand} sees in Forkcast</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-muted">
          <li>The AI made {made} ads and screened them in a simulated experiment. {ads.length} finalists survived.</li>
          <li>Watch Humans members swipe on the finalists before their free sample ships.</li>
          <li>Each swipe is real human fitness, so people crown the winner, not the simulation. The video reviews follow.</li>
        </ol>
        <Link href={`/watch-humans/analytics?c=${encodeURIComponent(campaign.id)}`} className="e-pill e-lime w-full transition-transform hover:-translate-y-0.5 sm:w-auto">
          See customer analytics →
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[15px]">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="pb-2 font-medium">Finalist</th>
              <th className="pb-2 text-right font-medium">AI: simulated CTR</th>
              <th className="pb-2 pl-4 font-medium">Members who would tap</th>
            </tr>
          </thead>
          <tbody>
            {ads.map((ad) => {
              const t = tally[ad.id];
              return (
                <tr key={ad.id} className="border-t border-line">
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <img src={ad.imageUrl ?? campaign.product.imageUrl} alt="" className="size-12 shrink-0 rounded-xl border border-line object-cover" />
                      <div>
                        <p className="font-medium leading-snug">{ad.headline}</p>
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          {LEVER_LABEL[ad.lever]}
                          {ad.id === campaign.winnerId && <span className="rounded-full bg-ai-mark/15 px-2 py-0.5 font-medium text-ai">AI pick</span>}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-right tabular-nums">{ad.experiment ? pct(ad.experiment.ctr) : "n/a"}</td>
                  <td className="py-3 pl-4">
                    {t ? (
                      <div className="flex items-center gap-2">
                        <div aria-hidden className="h-1.5 w-16 overflow-hidden rounded-full bg-track">
                          <div className={`h-full rounded-full bg-forest ${m.ease}`} style={{ width: pct(t.taps / t.n) }} />
                        </div>
                        <span className="tabular-nums">
                          {t.taps} of {t.n}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted">no swipes yet</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className={`rounded-2xl border border-edge p-4 ${m.lift}`}>
          <dt className="text-xs text-muted">
            <span aria-hidden className="mr-2 inline-block size-2.5 bg-ai-mark" />
            AI&apos;s pick (simulated)
          </dt>
          <dd className="mt-1 font-medium">{aiPick?.headline ?? "none yet"}</dd>
        </div>
        <div className={`rounded-2xl border border-edge p-4 ${m.lift}`}>
          <dt className="text-xs text-muted">
            <span aria-hidden className="mr-2 inline-block size-2.5 bg-forest" />
            Members&apos; pick ({claimed} {claimed === 1 ? "sample" : "samples"} claimed)
          </dt>
          <dd key={membersPick?.id ?? String(swiped)} className={`mt-1 font-medium ${m.rise}`}>
            {membersPick?.headline ?? (swiped ? "tied so far" : "waiting for swipes")}
          </dd>
        </div>
      </dl>
      {aiPick && membersPick && (
        <p key={String(membersPick.id === aiPick.id)} className={`text-[15px] ${m.rise}`}>
          {membersPick.id === aiPick.id
            ? "Members agree with the AI so far."
            : "Members disagree with the AI so far: real people overrule the simulation."}
        </p>
      )}
    </section>
  );
}
