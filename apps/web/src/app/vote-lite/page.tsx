"use client";

/**
 * /vote-lite: insurance voting page, used only if the primary /vote is not ready.
 * Self-contained on purpose: its own helpers (./lite), no shared state with /vote.
 *
 * Decisions made without asking:
 * - A mid-deck refresh restarts at card 1 in the same order; the API dedupes on
 *   (voterId, variantId), so repeats are harmless and no extra storage key is needed.
 * - No polling for round 2: reopening the page starts any round whose done flag is unset.
 * - The queue is retried on mount and every 10 s as well as after each successful
 *   POST, so a failed last vote is not stranded. 4xx rejections are retried too
 *   (ponytail: add attempt counts if a round change makes that noisy).
 * - Both calls time out after 8 s. POST /votes is idempotent, so a timed-out vote
 *   that did land is harmless when the queue resends it.
 * - Taps within 350 ms of a card appearing are ignored: double-taps, not votes.
 * - Consent copy is verbatim from the brief; each vote also carries a random voter
 *   id and the dwell time, which that line does not mention.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Product, ResponseOf, Segment, Variant, VoteRequest } from "@hack/contract";
import { ErrorNote, Skeleton } from "../../components/ui";
import { fetchTyped } from "../../lib/client";
import {
  browserStorage, clampDwell, doneKey, enqueue, flush, getVoterId, hashString, parseSegmentParam, readQueue, shuffleSeeded,
} from "./lite";

type Stage = "intro" | "segment" | "cards" | "done";
type Data = ResponseOf<"variants">;
type Load = { status: "loading" } | { status: "error"; error: unknown } | { status: "ready"; data: Data };

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: "student", label: "Student" },
  { value: "young_pro", label: "Young professional" },
  { value: "parent", label: "Parent" },
  { value: "fitness", label: "Into fitness" },
  { value: "other", label: "None of these" },
];

const MIN_DWELL_MS = 350;
const NET_TIMEOUT_MS = 8_000;
const RETRY_MS = 10_000;

const BTN = "min-h-14 touch-manipulation select-none rounded-xl text-lg font-semibold";
// Both answers share one neutral style: a louder button would bias the tap rate we are measuring.
const VOTE_BTN = `${BTN} flex-1 border border-edge bg-panel active:bg-edge`;
const PRIMARY_BTN = `${BTN} w-full bg-accent text-bg active:opacity-80`;

function within<T>(request: Promise<T>): Promise<T> {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), NET_TIMEOUT_MS));
  return Promise.race([request, timeout]);
}

async function sendVote(vote: VoteRequest): Promise<void> {
  const res = await within(fetchTyped("vote", { body: vote }));
  if (!res.ok) throw new Error(res.error ?? "vote rejected");
}

export default function VoteLitePage() {
  const [store] = useState(browserStorage);
  const [stage, setStage] = useState<Stage>("intro");
  const [segment, setSegment] = useState<Segment | null>(null);
  const [voterId, setVoterId] = useState<string | null>(null);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [pending, setPending] = useState(0);
  const flushing = useRef(false);

  const loadVariants = useCallback(() => {
    setLoad({ status: "loading" });
    within(fetchTyped("variants")).then(
      (data) => {
        setLoad({ status: "ready", data });
        if (store.getItem(doneKey(data.round))) setStage("done");
      },
      (error: unknown) => setLoad({ status: "error", error }),
    );
  }, [store]);

  const flushQueue = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      await flush(store, sendVote);
    } finally {
      flushing.current = false;
      setPending(readQueue(store).length);
    }
  }, [store]);

  // Optimistic: the deck has already advanced; a failure only queues the vote for a later flush.
  const castVote = useCallback(
    (vote: VoteRequest) => {
      sendVote(vote).then(
        () => void flushQueue(),
        () => {
          enqueue(store, vote);
          setPending(readQueue(store).length);
        },
      );
    },
    [store, flushQueue],
  );

  useEffect(() => {
    setVoterId(getVoterId(store));
    loadVariants();
    void flushQueue();
    const timer = setInterval(() => void flushQueue(), RETRY_MS);
    return () => clearInterval(timer);
  }, [store, loadVariants, flushQueue]);

  const start = () => {
    const preset = parseSegmentParam(window.location.search);
    if (preset) setSegment(preset);
    setStage(preset ? "cards" : "segment");
  };

  const data = load.status === "ready" ? load.data : null;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-6">
      {stage === "intro" && <Intro count={data?.variants.length ?? 6} onStart={start} />}
      {stage === "segment" && (
        <SegmentPick
          onPick={(picked) => {
            setSegment(picked);
            setStage("cards");
          }}
        />
      )}
      {stage === "cards" &&
        (data && voterId && segment ? (
          <Deck
            data={data}
            voterId={voterId}
            segment={segment}
            onVote={castVote}
            onFinish={() => {
              store.setItem(doneKey(data.round), "1");
              setStage("done");
            }}
          />
        ) : (
          <LoadGate load={load} onRetry={loadVariants} />
        ))}
      {stage === "done" && <Done pending={pending} />}
    </main>
  );
}

function Intro({ count, onStart }: { count: number; onStart: () => void }) {
  return (
    <section className="my-auto space-y-6 pb-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">30-second taste test.</h1>
        <p className="text-xl text-muted">{count} ads. Anonymous.</p>
        <p className="text-muted">For each ad, would you tap it or scroll past? Go with your gut.</p>
      </div>
      <p className="text-sm text-muted">
        We store a random ID, the group you pick, your answers and how long each took, nothing else. Results are shown after the round closes and published in our public repo.
      </p>
      <button type="button" onClick={onStart} className={PRIMARY_BTN}>
        Start
      </button>
    </section>
  );
}

function SegmentPick({ onPick }: { onPick: (segment: Segment) => void }) {
  return (
    <section className="my-auto space-y-4 pb-6">
      <h1 className="text-2xl font-semibold tracking-tight">Which group fits you best?</h1>
      <div className="space-y-3">
        {SEGMENTS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => onPick(value)}
            className={`${BTN} flex w-full items-center border border-edge bg-panel px-4 text-left font-medium active:bg-edge`}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function LoadGate({ load, onRetry }: { load: Load; onRetry: () => void }) {
  if (load.status !== "error") {
    return (
      <div className="my-auto pb-6">
        <Skeleton rows={4} />
      </div>
    );
  }
  return (
    <section className="my-auto space-y-4 pb-6">
      <p className="text-lg font-medium">Could not load the ads.</p>
      <ErrorNote error={load.error} />
      <button type="button" onClick={onRetry} className={PRIMARY_BTN}>
        Try again
      </button>
    </section>
  );
}

function Deck({ data, voterId, segment, onVote, onFinish }: {
  data: Data; voterId: string; segment: Segment; onVote: (vote: VoteRequest) => void; onFinish: () => void;
}) {
  // Computed once: the same voter and round always deal the same order.
  const [deck] = useState(() => shuffleSeeded(data.variants, voterId + data.round));
  const [i, setI] = useState(0);
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = performance.now();
    window.scrollTo(0, 0); // a taller card must not open half-scrolled on a small phone
  }, [i]);

  const card = deck[i];
  if (!card) return <p className="my-auto pb-6 text-center text-lg">No ads to rate right now.</p>;

  const answer = (tapped: boolean) => {
    const dwell = performance.now() - shownAt.current;
    if (dwell < MIN_DWELL_MS) return;
    onVote({ voterId, segment, variantId: card.id, tapped, dwellMs: clampDwell(dwell) });
    if (i + 1 < deck.length) setI(i + 1);
    else onFinish();
  };

  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <div aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-edge">
          <div className="h-full bg-accent" style={{ width: `${((i + 1) / deck.length) * 100}%` }} />
        </div>
        <span className="text-sm tabular-nums text-muted">{i + 1} / {deck.length}</span>
      </div>
      <div className="flex-1 pb-4">
        <AdCard key={card.id} product={data.product} variant={card} />
      </div>
      <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-edge bg-bg px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={() => answer(false)} className={VOTE_BTN}>
          Scroll past
        </button>
        <button type="button" onClick={() => answer(true)} className={VOTE_BTN}>
          Would tap
        </button>
      </div>
    </>
  );
}

function AdCard({ product, variant }: { product: Product; variant: Variant }) {
  const [imageFailed, setImageFailed] = useState(false);
  const brandColor = `hsl(${hashString(product.brand) % 360} 55% 30%)`;
  return (
    <article className="overflow-hidden rounded-xl bg-white text-neutral-900">
      <header className="flex items-center gap-3 p-3">
        <div
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full text-lg font-bold text-white"
          style={{ backgroundColor: brandColor }}
        >
          {product.brand.charAt(0).toUpperCase()}
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold">{product.brand}</div>
          <div className="text-xs text-neutral-500">Sponsored</div>
        </div>
      </header>
      <p className="px-3 pb-3 text-[15px] leading-snug">{variant.body}</p>
      {imageFailed ? (
        <div
          className="grid aspect-[4/3] place-items-center p-6 text-center text-xl font-bold text-white"
          style={{ backgroundColor: brandColor }}
        >
          {product.name}
        </div>
      ) : (
        <img
          src={variant.imageUrl ?? product.imageUrl}
          alt={product.name}
          onError={() => setImageFailed(true)}
          className="aspect-[4/3] w-full bg-neutral-200 object-cover"
        />
      )}
      <div className="flex items-center gap-3 bg-neutral-100 p-3">
        <h2 className="min-w-0 flex-1 text-[15px] font-semibold leading-tight">{variant.headline}</h2>
        <span className="shrink-0 select-none rounded-full bg-neutral-200 px-4 py-2 text-sm font-semibold">{variant.cta}</span>
      </div>
      <p className="px-3 py-2 text-[11px] text-neutral-500">Concept test, not a real ad</p>
    </article>
  );
}

function Done({ pending }: { pending: number }) {
  return (
    <section className="my-auto space-y-3 pb-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Thanks, your votes are in.</h1>
      <p className="text-xl text-muted">Results are revealed after this round closes.</p>
      {pending > 0 && (
        <p className="text-sm text-muted">
          Still sending {pending} {pending === 1 ? "vote" : "votes"}. Keep this page open a moment.
        </p>
      )}
    </section>
  );
}
