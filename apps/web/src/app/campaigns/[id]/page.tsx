"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { Ad, Campaign, Generation, Lever, Product } from "@hack/contract";
import { Logo } from "../../../components/Logo";
import { ErrorNote, Skeleton } from "../../../components/ui";
import { fetchTyped } from "../../../lib/client";
import { useEndpoint } from "../../../lib/useEndpoint";
import { safeStorage, type StorageLike } from "../../vote-lite/lite";
import { AdDrawer, type OpenAd } from "./AdDrawer";
import { AdTile, type Delivered } from "./AdTile";
import { AgentRun, RUN_STEPS, StepBar } from "./AgentRun";
import { Analytics } from "./Analytics";
import { Winner } from "./Winner";
import { byFitness, errorText, LEVER_LABEL, LEVERS, railSteps, survived, type Step } from "./format";

const POLL_MS = 2000;
const STEP_MS = 350;
const ADMIN_KEY = "fk-admin";
const WRAP = "mx-auto w-full max-w-[1344px] px-4 md:px-12";
const PILL = "e-mono inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-[13px] font-medium uppercase tracking-[0.04em]";
const TABS = [["ads", "Ads"], ["analytics", "Analytics"]] as const;
type Tab = (typeof TABS)[number][0];

export default function Page() {
  return (
    <Suspense>
      <CampaignView />
    </Suspense>
  );
}

/**
 * The admin token arrives once as ?admin=<token>. Keep it for this tab and strip it from the URL,
 * so it stays out of the address bar on the demo screen. The first visit's URL still reaches browser history:
 * record demos in a private window.
 */
function useAdminToken(): string | null {
  const fromUrl = useSearchParams().get("admin");
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let raw: StorageLike | null = null;
    try {
      raw = window.sessionStorage;
    } catch {
      // Storage blocked: the token lives in React state for this page view only.
    }
    const tab = safeStorage(raw);
    if (fromUrl) {
      tab.setItem(ADMIN_KEY, fromUrl);
      window.history.replaceState(null, "", window.location.pathname);
    }
    setToken((held) => fromUrl ?? tab.getItem(ADMIN_KEY) ?? held);
  }, [fromUrl]);
  return token;
}

function CampaignView() {
  const { id } = useParams<{ id: string }>();
  const adminToken = useAdminToken();
  const { data, error, reload } = useEndpoint("campaign", { params: { id } });
  const [picked, setPicked] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("ads");
  const [open, setOpen] = useState<OpenAd>(null);
  const c = data?.campaign;
  const running = !!c && c.stage !== "done" && c.stage !== "error";

  // Poll while the job runs; a finished campaign never changes.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(reload, POLL_MS);
    return () => clearInterval(timer);
  }, [running, reload]);

  if (!c) {
    return (
      <div className="theme-e">
        <TopBar />
        <div className={`${WRAP} mt-10 flex flex-col items-start gap-4`}>
          {error ? (
            <>
              <ErrorNote error={error} />
              <button type="button" onClick={reload} className="e-pill e-outline">Try again</button>
            </>
          ) : (
            <Skeleton rows={6} />
          )}
        </div>
      </div>
    );
  }

  const gen = c.generations.find((g) => g.gen === picked) ?? c.generations.at(-1);
  const pick = (g: number) => {
    setPicked(g);
    setTab("ads");
  };

  const rail = (
    <nav aria-label="Generations" className="flex flex-wrap items-start gap-y-3">
      {railSteps(c).map((s, i) => (
        <Fragment key={s.key}>
          {i > 0 && <span aria-hidden className="mt-[22px] h-px w-6 flex-none bg-ink/35" />}
          <RailStep step={s} c={c} selected={tab === "ads" && s.key === `g${gen?.gen}`} onPick={pick} />
        </Fragment>
      ))}
    </nav>
  );

  return (
    <div className="theme-e pb-16">
      <TopBar />
      {/* While a generation runs, the agent screen replaces the summary; earlier generations stay browsable below it. */}
      {running ? (
        <div className={`${WRAP} mt-8`}>
          <AgentRun c={c} />
          {error != null && <p className="mt-3 text-sm text-muted">Lost contact with the server. Retrying every 2 s.</p>}
          {c.generations.length > 0 && <div className="mt-12">{rail}</div>}
        </div>
      ) : (
        <Summary c={c} gen={gen} rail={rail} adminToken={adminToken} onEvolved={reload} />
      )}
      {c.stage === "error" && (
        <p role="alert" className={`${WRAP} mt-8 text-lg text-bad`}>This run stopped: {c.error ?? "no reason given"}. {c.generations.length ? "An admin can evolve again to retry." : "Start a new campaign to try again."}</p>
      )}
      {c.winnerId && !running && <div className={WRAP}><Winner campaign={c} onOpen={(id) => setOpen({ id })} /></div>}
      {c.generations.length > 0 && <>
      <div className={`${WRAP} mt-11`}>
        <div role="tablist" aria-label="Campaign views" className="flex gap-8 border-b border-line">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`tab-${key}`}
              aria-selected={tab === key}
              aria-controls="campaign-panel"
              onClick={() => setTab(key)}
              className={`e-h -mb-px cursor-pointer border-b-2 pb-2.5 text-[28px] md:text-[40px] ${tab === key ? "border-ink text-ink" : "border-transparent text-[#8C8C8C]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <section id="campaign-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className={`${WRAP} mt-8`}>
        {tab === "analytics" ? (
          <Analytics campaign={c} />
        ) : (
          gen && <Grid key={gen.gen} gen={gen} product={c.product} onOpen={(id) => setOpen({ id, gen: gen.gen })} />
        )}
      </section>
      </>}
      <AdDrawer campaign={c} open={open} onOpen={(id) => setOpen({ id })} onClose={() => setOpen(null)} />
    </div>
  );
}

function TopBar() {
  return (
    <header className="border-b border-line">
      <div className={`${WRAP} flex items-center justify-between gap-4 py-[18px]`}>
        <Logo />
        <Link href="/" className="e-pill e-outline">New campaign</Link>
      </div>
    </header>
  );
}

/**
 * The finished run, laid out like the agent screen it replaces: the same step bar, now all ticked, and the pack on
 * the left; the title blurs into focus on the right.
 */
function Summary({ c, gen, rail, adminToken, onEvolved }: {
  c: Campaign;
  gen: Generation | undefined;
  rail: ReactNode;
  adminToken: string | null;
  onEvolved: () => void;
}) {
  const facts = c.product.facts;
  const n = gen?.ads.length ?? 0;
  const impressions = gen?.ads.reduce((sum, a) => sum + (a.experiment?.impressions ?? 0), 0) ?? 0;
  const title = !gen ? "This run stopped" : gen.gen === 0 ? `${n} ads ready for ${c.product.name || c.name}` : `${n} ads in generation ${gen.gen}`;
  return (
    <section aria-label="Campaign" className={`${WRAP} mt-8 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]`}>
      <div className="flex min-w-0 flex-col gap-6 lg:col-start-2">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 key={title} className="e-h fk-blur-in text-[36px] md:text-[56px]">{title}</h1>
            {/* 40 = the backend's 4 panel segments x 10 personas. */}
            {gen && <p className="mt-2 text-lg text-muted">Screened by 40 AI shoppers{impressions > 0 && ` · ${impressions.toLocaleString("en-GB")} simulated impressions`}</p>}
          </div>
          {c.winnerId && (
            <a href="#winner" className="e-pill bg-ink text-white">
              See the fittest ad
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14" />
                <path d="M13 6l6 6-6 6" />
              </svg>
            </a>
          )}
        </div>
        {rail}
        {facts.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
              <span className="e-lbl">Read off the pack</span>
              <span className="text-sm text-muted">Copy may only claim these.</span>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {facts.map((f, i) => <li key={i} className="e-chip px-2.5 py-1 text-[13px]">{f}</li>)}
            </ul>
          </div>
        )}
        {adminToken && <Admin c={c} token={adminToken} onEvolved={onEvolved} />}
      </div>
      <aside className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1">
        <div className="e-tile p-4 shadow-[0_8px_24px_rgb(0_0_0/0.05)]">
          <StepBar at={gen ? RUN_STEPS.length : 0} f={0} />
          <p className="mt-3 text-[13px] text-muted">{gen ? `${n} ads ready` : "Stopped"}</p>
        </div>
        <div className="e-tile overflow-hidden shadow-[0_8px_24px_rgb(0_0_0/0.05)]">
          <img src={c.sourceImageUrl} alt="Your upload" className="block aspect-[4/3] w-full bg-track object-contain p-3" />
          <div className="border-t border-line p-4">
            <p className="font-medium">{c.name}</p>
            {c.product.price && <p className="text-sm text-muted">{c.product.price}</p>}
          </div>
        </div>
      </aside>
    </section>
  );
}

/** Shown once this tab has been given ?admin=<token> (see useAdminToken); the API checks the token. */
function Admin({ c, token, onEvolved }: { c: Campaign; token: string; onEvolved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // The API also evolves from an error, retrying from the last survivors instead of a new paid run.
  const ready = (c.stage === "done" || c.stage === "error") && c.generations.length > 0;

  async function evolve() {
    setBusy(true);
    setFailure(null);
    try {
      const res = await fetchTyped("evolveCampaign", { params: { id: c.id }, body: { adminToken: token } });
      if (!res.ok) throw new Error(res.error ?? "Evolve was refused.");
      onEvolved();
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2.5">
      <span className="e-lbl">Admin</span>
      <button type="button" onClick={evolve} disabled={!ready || busy} className="e-pill e-lime">{busy ? "Evolving…" : "Evolve"}</button>
      {/* POST /campaigns/:id/room is not built: the room round runs from scripts/seal-round.sh. */}
      <button type="button" disabled className="e-pill e-outline">Test with real people</button>
      {failure ? (
        <span role="alert" className="text-[13px] text-bad">{failure}</span>
      ) : (
        <span className="text-[13px] text-muted">
          {!ready ? "Evolve is off while a generation runs." : c.stage === "error" ? "Evolve again to retry from the last survivors." : "Evolve breeds the next generation from the survivors."}{" "}
          People rounds run from scripts/seal-round.sh for now.
        </span>
      )}
    </div>
  );
}

function RailStep({ step, c, selected, onPick }: { step: Step; c: Campaign; selected: boolean; onPick: (gen: number) => void }) {
  const look = selected ? "border-ink bg-ink text-white"
    : step.state === "run" ? "border-transparent e-lime"
    : step.state === "done" ? "border-ink bg-white text-ink"
    : "border-edge bg-white text-muted";
  const body = (
    <>
      {step.state === "done" && <span aria-hidden className="e-lime grid size-[18px] place-items-center rounded-full text-[11px] font-bold">✓</span>}
      {step.label}
      {step.state === "run" && <span className="rounded-full border border-ink px-[7px] py-0.5 text-[11px]">Running</span>}
    </>
  );
  const gen = step.gen;
  const g = c.generations.find((x) => x.gen === gen);
  const meta = step.key === `g${gen}` && g?.sealedSha256 ? `${Math.round(g.seconds)} s · sealed ${g.sealedSha256.slice(0, 8)}`
    : step.state === "run" && step.key.startsWith("g") ? c.progress.label
    : null;
  return (
    <div className="flex flex-col gap-1.5">
      {gen != null ? (
        <button type="button" aria-pressed={selected} onClick={() => onPick(gen)} className={`${PILL} ${look} cursor-pointer`}>{body}</button>
      ) : step.key === "winner" && step.state === "done" ? (
        <a href="#winner" className={`${PILL} ${look}`}>{body}</a>
      ) : (
        <span className={`${PILL} ${look}`}>{body}</span>
      )}
      {meta && <span className="e-mono pl-4 text-xs text-muted">{meta}</span>}
    </div>
  );
}

function Grid({ gen, product, onOpen }: { gen: Generation; product: Product; onOpen: (id: string) => void }) {
  const [step, setStep] = useState<number | null>(null); // null = the finished simulation
  const [lever, setLever] = useState<Lever | null>(null); // null = every lever
  const last = gen.timeline.length - 1;

  // "Play delivery" walks the 20 budget snapshots; the order of the cards stays fixed while it plays.
  useEffect(() => {
    if (step == null || step >= last) return;
    const timer = setTimeout(() => setStep(step + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [step, last]);

  const ads = [...gen.ads].sort(byFitness);
  const visible = lever ? ads.filter((a) => a.lever === lever) : ads;
  const alive = ads.filter(survived).length;
  const culled = ads.filter((a) => a.status === "culled").length;
  const snapshot = step == null ? null : gen.timeline[step]?.impressionsByAd;
  const shown = (a: Ad) => (snapshot ? (snapshot[a.id] ?? 0) : (a.experiment?.impressions ?? 0));
  const lead = Math.max(1, ...ads.map(shown));
  const total = ads.reduce((sum, a) => sum + shown(a), 0);
  const final = step == null || step === last;
  const delivered = (a: Ad): Delivered | null => (snapshot || a.experiment ? { impressions: shown(a), share: shown(a) / lead, final } : null);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <span className="e-lbl">Gen {gen.gen} · ranked by simulated CTR</span>
        <span className="text-[15px] text-muted">{ads.length} ads. {alive || culled ? `${alive} survive, ${culled} culled.` : "Screening now."}</span>
      </div>
      {last >= 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" onClick={() => setStep(0)} className="e-pill e-outline">Play delivery</button>
          <input
            type="range"
            min={0}
            max={last}
            value={step ?? last}
            onChange={(e) => setStep(Number(e.target.value))}
            aria-label="Delivery step"
            className="w-48 accent-forest"
          />
          <span className="e-mono text-[13px] text-muted">
            Simulated · step {(step ?? last) + 1} of {last + 1} · {total.toLocaleString("en-GB")} impressions · not real CTR
          </span>
        </div>
      )}
      <div role="group" aria-label="Filter by lever" className="mt-5 flex flex-wrap gap-2">
        <Chip on={lever == null} onClick={() => setLever(null)} label="All" n={ads.length} />
        {LEVERS.map((l) => {
          const n = ads.filter((a) => a.lever === l).length;
          return n > 0 && <Chip key={l} on={lever === l} onClick={() => setLever(l)} label={LEVER_LABEL[l]} n={n} />;
        })}
      </div>
      {/* Keyed by the filter, so a new filter deals its cards in again. */}
      <div key={lever ?? "all"} className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-6">
        {visible.map((ad, i) => (
          // Each card pops in over a shimmer slot, 40 ms after the one before, capped at about 1 s for the last.
          <div key={ad.id} className="fk-shimmer fk-slot min-w-0 rounded-[18px]">
            <div
              className="fk-pop grid h-full transition-[translate] duration-200 hover:-translate-y-1 motion-reduce:transition-none"
              style={{ "--d": `${Math.min(i, 24) * 40}ms` } as CSSProperties}
            >
              <AdTile ad={ad} product={product} delivered={delivered(ad)} onOpen={() => onOpen(ad.id)} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Chip({ on, onClick, label, n }: { on: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm ${on ? "border-ink bg-ink text-white" : "border-edge bg-white hover:border-ink/40"}`}
    >
      {label}
      <span className={on ? "text-white/60" : "text-muted"}>{n}</span>
    </button>
  );
}
