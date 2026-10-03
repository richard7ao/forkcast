"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useState, type ReactNode } from "react";
import type { Campaign, Generation } from "@hack/contract";
import { ErrorNote, Skeleton } from "../../../components/ui";
import { fetchTyped } from "../../../lib/client";
import { useEndpoint } from "../../../lib/useEndpoint";
import { AdDrawer, type OpenAd } from "./AdDrawer";
import { AgentRun, RUN_STEPS, StepBar } from "./AgentRun";
import { Analytics } from "./Analytics";
import { Grid, tabStorage, type Breed } from "./Grid";
import { TopBar, WRAP } from "./TopBar";
import { errorText, railSteps, type Step } from "./format";

const POLL_MS = 2000;
const ADMIN_KEY = "fk-admin";
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
    const tab = tabStorage(); // blocked storage: the token lives in memory for this page view only
    if (fromUrl) {
      tab.setItem(ADMIN_KEY, fromUrl);
      window.history.replaceState(null, "", window.location.pathname);
    }
    setToken((held) => fromUrl ?? tab.getItem(ADMIN_KEY) ?? held);
  }, [fromUrl]);
  return token;
}

/** The admin's Evolve call, shared by the admin row and the "Breed the survivors" step after a rollout. */
function useEvolve(id: string, token: string | null, onEvolved: () => void): Breed {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  async function evolve() {
    if (!token) return;
    setBusy(true);
    setFailure(null);
    try {
      const res = await fetchTyped("evolveCampaign", { params: { id }, body: { adminToken: token } });
      if (!res.ok) throw new Error(res.error ?? "Evolve was refused.");
      onEvolved();
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, failure, evolve: token ? evolve : null };
}

function CampaignView() {
  const { id } = useParams<{ id: string }>();
  const adminToken = useAdminToken();
  const { data, error, reload } = useEndpoint("campaign", { params: { id } });
  const breed = useEvolve(id, adminToken, reload);
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
      <TopBar campaign={c} />
      {/* While a generation runs, the agent screen replaces the summary; earlier generations stay browsable below it. */}
      {running ? (
        <div className={`${WRAP} mt-8`}>
          <AgentRun c={c} />
          {error != null && <p className="mt-3 text-sm text-muted">Lost contact with the server. Retrying every 2 s.</p>}
          {c.generations.length > 0 && <div className="mt-12">{rail}</div>}
        </div>
      ) : (
        <Summary c={c} gen={gen} rail={rail} breed={breed} />
      )}
      {c.stage === "error" && (
        <p role="alert" className={`${WRAP} mt-8 text-lg text-bad`}>This run stopped: {c.error ?? "no reason given"}. {c.generations.length ? "An admin can evolve again to retry." : "Start a new campaign to try again."}</p>
      )}
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
          gen && (
            <Grid
              key={gen.gen}
              c={c}
              gen={gen}
              isLast={gen === c.generations.at(-1)}
              breed={breed}
              onNext={pick}
              onOpen={(id) => setOpen({ id, gen: gen.gen })}
            />
          )
        )}
      </section>
      </>}
      <AdDrawer campaign={c} open={open} onOpen={(id) => setOpen({ id })} onClose={() => setOpen(null)} />
    </div>
  );
}

/**
 * The finished run, laid out like the agent screen it replaces: the same step bar, now all ticked, and the pack on
 * the left; the title blurs into focus on the right.
 */
function Summary({ c, gen, rail, breed }: { c: Campaign; gen: Generation | undefined; rail: ReactNode; breed: Breed }) {
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
            <Link href={`/campaigns/${encodeURIComponent(c.id)}/winner`} className="e-pill bg-ink text-white">
              Meet the winner
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14" />
                <path d="M13 6l6 6-6 6" />
              </svg>
            </Link>
          )}
        </div>
        {rail}
        {facts.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
              <span className="e-lbl">Read off the pack</span>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {facts.map((f, i) => <li key={i} className="e-chip px-2.5 py-1 text-[13px]">{f}</li>)}
            </ul>
          </div>
        )}
        {breed.evolve && <Admin c={c} breed={breed} />}
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
function Admin({ c, breed }: { c: Campaign; breed: Breed }) {
  // The API also evolves from an error, retrying from the last survivors instead of a new paid run.
  const ready = (c.stage === "done" || c.stage === "error") && c.generations.length > 0;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2.5">
      <span className="e-lbl">Admin</span>
      <button type="button" onClick={() => breed.evolve?.()} disabled={!ready || breed.busy} className="e-pill e-lime">{breed.busy ? "Evolving…" : "Evolve"}</button>
      {breed.failure ? (
        <span role="alert" className="text-[13px] text-bad">{breed.failure}</span>
      ) : (
        <span className="text-[13px] text-muted">
          {!ready ? "Evolve is off while a generation runs." : c.stage === "error" ? "Evolve again to retry from the last survivors." : "Evolve breeds the next generation from the survivors."}
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
        <Link href={`/campaigns/${encodeURIComponent(c.id)}/winner`} className={`${PILL} ${look}`}>{body}</Link>
      ) : (
        <span className={`${PILL} ${look}`}>{body}</span>
      )}
      {meta && <span className="e-mono pl-4 text-xs text-muted">{meta}</span>}
    </div>
  );
}
