"use client";

/**
 * /watch-humans: concept demo of Forkcast inside Watch Humans, Really Good Culture's app that sends
 * members free products to review on video. Before a free sample ships, the member swipes on the brand's
 * finalist ads, and every swipe is real human fitness for the experiment. Left: the member's phone.
 * Right: what the brand sees in Forkcast. ?c=<campaign id> picks the campaign (default demo-epic).
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
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Ad, Campaign, Product } from "@hack/contract";
import { ErrorNote, Skeleton } from "../../components/ui";
import { useEndpoint } from "../../lib/useEndpoint";
import { AdCard } from "../vote-lite/AdCard";
import { shuffleSeeded } from "../vote-lite/lite";
import { finalists, humanLeader, record, swipeDirection, SWIPE_PX, type Tally } from "./swipe";

type Stage = "offer" | "deck" | "claimed";

const BTN = "min-h-12 touch-manipulation select-none rounded-xl font-semibold";
const ANSWER_BTN = `${BTN} flex-1 border border-edge bg-bg active:bg-edge`;
const PRIMARY_BTN = `${BTN} w-full bg-accent text-bg active:opacity-80`;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default function WatchHumansPage() {
  // useSearchParams needs a Suspense boundary when Next prerenders the page.
  return (
    <Suspense>
      <Demo />
    </Suspense>
  );
}

function Demo() {
  const id = useSearchParams().get("c") ?? "demo-epic";
  const { data, error, reload } = useEndpoint("campaign", { params: { id } });
  if (error) {
    return (
      <main className="mx-auto max-w-md space-y-4 px-4 py-10">
        <p className="text-lg font-medium">Could not load campaign &quot;{id}&quot;.</p>
        <ErrorNote error={error} />
        <button type="button" onClick={() => reload()} className={PRIMARY_BTN}>
          Try again
        </button>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <Skeleton rows={6} />
      </main>
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
    <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-6 md:grid-cols-[minmax(0,380px)_minmax(0,1fr)] md:items-start">
      <header className="space-y-1 md:col-span-2">
        <h1 className="text-2xl font-semibold tracking-tight">Forkcast inside Watch Humans</h1>
        <span className="inline-block rounded-full border border-edge px-2.5 py-0.5 text-xs text-muted">Concept demo</span>
      </header>
      <section aria-label="A member's phone" className="flex min-h-[600px] flex-col rounded-[2rem] border border-edge bg-panel p-4">
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
  );
}

function Offer({ product, count, onStart }: { product: Product; count: number; onStart: () => void }) {
  // Short facts read as chips; long ones (the pack slogan) would wrap into paragraphs.
  const chips = product.facts.filter((fact) => fact.length <= 24).slice(0, 4);
  return (
    <div className="my-auto space-y-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Watch Humans · your next box</p>
      <div className="space-y-3 rounded-2xl bg-bg p-4">
        <p className="text-sm text-muted">{product.brand}</p>
        <h2 className="text-2xl font-semibold leading-tight">{product.name}</h2>
        <ul className="flex flex-wrap gap-2">
          {chips.map((fact) => (
            <li key={fact} className="rounded-full border border-edge px-3 py-1 text-sm">
              {fact}
            </li>
          ))}
        </ul>
        <p className="text-sm font-semibold text-good">Free sample</p>
      </div>
      {count > 0 ? (
        <>
          <p>
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
  const card = deck[i];

  const answer = (tapped: boolean) => {
    if (!card) return;
    onSwipe(card.id, tapped);
    if (i + 1 < deck.length) setI(i + 1);
    else onDone();
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
  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <div aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-edge">
          <div className="h-full bg-accent" style={{ width: `${((i + 1) / deck.length) * 100}%` }} />
        </div>
        <span className="text-sm tabular-nums text-muted">
          {i + 1} / {deck.length}
        </span>
      </div>
      <div
        key={card.id}
        className="relative cursor-grab touch-pan-y select-none active:cursor-grabbing"
        style={{ transform: `translateX(${dx}px) rotate(${dx / 24}deg)`, transition: drag ? "none" : "transform 150ms ease-out" }}
        onPointerDown={(e) => {
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
        <AdCard product={product} variant={card} />
        {dx !== 0 && (
          <span
            className={`absolute top-16 rounded-lg border-2 bg-bg/80 px-3 py-1 text-lg font-bold ${dx > 0 ? "left-4 border-good text-good" : "right-4 border-bad text-bad"}`}
            style={{ opacity: Math.min(1, Math.abs(dx) / SWIPE_PX) }}
          >
            {dx > 0 ? "Would tap" : "Scroll past"}
          </span>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-muted">Swipe the ad, or use the buttons or arrow keys.</p>
      <div className="mt-auto flex gap-3 pt-3">
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
    <div className="my-auto space-y-4 text-center">
      <h2 className="text-3xl font-semibold tracking-tight">Sample claimed.</h2>
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
    <section aria-label="What the brand sees" className="space-y-5 rounded-xl border border-edge bg-panel p-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">What {campaign.product.brand} sees in Forkcast</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>The AI made {made} ads and screened them in a simulated experiment. {ads.length} finalists survived.</li>
          <li>Watch Humans members swipe on the finalists before their free sample ships.</li>
          <li>Each swipe is real human fitness, so people crown the winner, not the simulation. The video reviews follow.</li>
        </ol>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
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
                <tr key={ad.id} className="border-t border-edge">
                  <td className="py-2">
                    <div className="flex items-center gap-3">
                      <img src={ad.imageUrl ?? campaign.product.imageUrl} alt="" className="size-10 shrink-0 rounded object-cover" />
                      <div>
                        <p className="font-medium leading-snug">{ad.headline}</p>
                        <p className="text-xs text-muted">
                          {ad.lever.replace("_", " ")}
                          {ad.id === campaign.winnerId && " · AI winner"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 text-right tabular-nums">{ad.experiment ? pct(ad.experiment.ctr) : "n/a"}</td>
                  <td className="py-2 pl-4">
                    {t ? (
                      <div className="flex items-center gap-2">
                        <div aria-hidden className="h-1.5 w-16 overflow-hidden rounded-full bg-edge">
                          <div className="h-full bg-good" style={{ width: pct(t.taps / t.n) }} />
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
        <div className="rounded-lg bg-bg p-3">
          <dt className="text-xs text-muted">AI&apos;s pick (simulated)</dt>
          <dd className="font-medium">{aiPick?.headline ?? "none yet"}</dd>
        </div>
        <div className="rounded-lg bg-bg p-3">
          <dt className="text-xs text-muted">
            Members&apos; pick ({claimed} {claimed === 1 ? "sample" : "samples"} claimed)
          </dt>
          <dd className="font-medium">{membersPick?.headline ?? (swiped ? "tied so far" : "waiting for swipes")}</dd>
        </div>
      </dl>
      {aiPick && membersPick && (
        <p className="text-sm">
          {membersPick.id === aiPick.id
            ? "Members agree with the AI so far."
            : "Members disagree with the AI so far: real people overrule the simulation."}
        </p>
      )}
    </section>
  );
}
