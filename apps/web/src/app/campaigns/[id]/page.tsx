"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useState } from "react";
import type { Ad, Campaign, Generation, Product } from "@hack/contract";
import { Logo } from "../../../components/Logo";
import { ErrorNote, Skeleton } from "../../../components/ui";
import { fetchTyped } from "../../../lib/client";
import { useEndpoint } from "../../../lib/useEndpoint";
import { safeStorage, type StorageLike } from "../../vote-lite/lite";
import { AdDrawer, type OpenAd } from "./AdDrawer";
import { AdTile, type Delivered } from "./AdTile";
import { Analytics } from "./Analytics";
import { Winner } from "./Winner";
import { byFitness, railSteps, survived, type Step } from "./format";

const POLL_MS = 2000;
const FIRST_ADS = 12;
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
 * so it never shows in the address bar on the demo screen or lands in browser history.
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

  return (
    <div className="theme-e pb-16">
      <TopBar />
      <CampaignHeader c={c} adminToken={adminToken} onEvolved={reload} />
      <nav aria-label="Generations" className={`${WRAP} mt-10 flex flex-wrap items-start gap-y-3`}>
        {railSteps(c).map((s, i) => (
          <Fragment key={s.key}>
            {i > 0 && <span aria-hidden className="mt-[22px] h-px w-6 flex-none bg-ink/35" />}
            <RailStep step={s} c={c} selected={tab === "ads" && s.key === `g${gen?.gen}`} onPick={pick} />
          </Fragment>
        ))}
      </nav>
      {running && <Progress c={c} />}
      {running && error != null && <p className={`${WRAP} mt-3 text-sm text-muted`}>Lost contact with the server. Retrying every 2 s.</p>}
      {c.stage === "error" && (
        <p role="alert" className={`${WRAP} mt-8 text-lg text-bad`}>This run stopped: {c.error ?? "no reason given"}. Start a new campaign to try again.</p>
      )}
      {c.winnerId && <div className={WRAP}><Winner campaign={c} onOpen={(id) => setOpen({ id })} /></div>}
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
        ) : gen ? (
          <Grid key={gen.gen} gen={gen} product={c.product} onOpen={(id) => setOpen({ id, gen: gen.gen })} />
        ) : (
          <p className="e-tile p-8 text-muted">Gen 0 appears here once its ads are written and rendered.</p>
        )}
      </section>
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

function CampaignHeader({ c, adminToken, onEvolved }: { c: Campaign; adminToken: string | null; onEvolved: () => void }) {
  const facts = c.product.facts;
  return (
    <section aria-label="Campaign" className={`${WRAP} mt-10 flex flex-col gap-8 md:flex-row md:items-start`}>
      <div className="e-pol w-fit flex-none -rotate-3 p-2 pb-2.5">
        <img src={c.sourceImageUrl} alt="Your upload" className="block h-[178px] w-[134px] rounded-[10px] object-cover" />
      </div>
      <div className="flex min-w-0 max-w-[880px] flex-col gap-3.5">
        <h1 className="e-h text-[40px] md:text-[64px]">{c.name}</h1>
        {c.product.brand && <p className="text-lg text-muted">{c.product.brand} · {c.product.name}</p>}
        {facts.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
              <span className="e-lbl">Read off the pack</span>
              <span className="text-sm text-muted">Copy may only claim these.</span>
            </div>
            <ul className="flex flex-wrap gap-2">
              {facts.map((f, i) => <li key={i} className="e-chip">{f}</li>)}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted">Reading the pack…</p>
        )}
        {adminToken && <Admin c={c} token={adminToken} onEvolved={onEvolved} />}
      </div>
    </section>
  );
}

/** Shown only with ?admin=<token>; the API checks the token. */
function Admin({ c, token, onEvolved }: { c: Campaign; token: string; onEvolved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const ready = c.stage === "done";

  async function evolve() {
    setBusy(true);
    setFailure(null);
    try {
      const res = await fetchTyped("evolveCampaign", { params: { id: c.id }, body: { adminToken: token } });
      if (!res.ok) throw new Error(res.error ?? "Evolve was refused.");
      onEvolved();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2.5">
      <span className="e-lbl">Admin</span>
      <button type="button" onClick={evolve} disabled={!ready || busy} className="e-pill e-lime">{busy ? "Evolving…" : "Evolve"}</button>
      {failure ? (
        <span role="alert" className="text-[13px] text-bad">{failure}</span>
      ) : (
        <span className="text-[13px] text-muted">
          {ready ? "Breeds the next generation from the survivors." : c.stage === "error" ? "Evolve is off: this run stopped." : "Evolve is off while a generation runs."}
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

function Progress({ c }: { c: Campaign }) {
  const { label, done, total } = c.progress;
  return (
    <section aria-label="Progress" className={`${WRAP} mt-8`}>
      <div className="flex max-w-[860px] flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5">
          <span id="progress-label" className="text-lg font-medium">{label}</span>
          <span className="e-mono text-[15px]">{done}/{total}</span>
          <span className="text-sm text-muted">Stage: {c.stage}</span>
        </div>
        <div role="progressbar" aria-labelledby="progress-label" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} className="relative h-1.5 rounded-full bg-track">
          <span
            className="e-lime absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
          />
        </div>
      </div>
    </section>
  );
}

function Grid({ gen, product, onOpen }: { gen: Generation; product: Product; onOpen: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const [step, setStep] = useState<number | null>(null); // null = the finished simulation
  const last = gen.timeline.length - 1;

  // "Play delivery" walks the 20 budget snapshots; the order of the cards stays fixed while it plays.
  useEffect(() => {
    if (step == null || step >= last) return;
    const timer = setTimeout(() => setStep(step + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [step, last]);

  const ads = [...gen.ads].sort(byFitness);
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
      <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-6">
        {(all ? ads : ads.slice(0, FIRST_ADS)).map((ad) => (
          <AdTile key={ad.id} ad={ad} product={product} delivered={delivered(ad)} onOpen={() => onOpen(ad.id)} />
        ))}
      </div>
      {!all && ads.length > FIRST_ADS && (
        <div className="e-pol mt-7 flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <span className="text-xl tracking-[-0.02em]">{ads.length - FIRST_ADS} more ads</span>
          <button type="button" onClick={() => setAll(true)} className="e-pill e-outline">Show all {ads.length}</button>
        </div>
      )}
    </>
  );
}
