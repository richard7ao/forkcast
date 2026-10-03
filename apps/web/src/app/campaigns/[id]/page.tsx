"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { Campaign, Generation } from "@hack/contract";
import { ErrorNote, Skeleton } from "../../../components/ui";
import { fetchTyped } from "../../../lib/client";
import { useEndpoint } from "../../../lib/useEndpoint";
import { AgentRun, RUN_STEPS, StepBar } from "./AgentRun";
import { Analytics } from "./Analytics";
import { Heatmaps } from "./Heatmaps";
import { Grid, tabStorage, type Breed } from "./Grid";
import { TopBar, WRAP } from "./TopBar";
import { adHref, errorText, railSteps, type Step } from "./format";

const POLL_MS = 2000;
const ADMIN_KEY = "fk-admin";
const PILL = "e-mono inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-[13px] font-medium uppercase tracking-[0.04em]";
const FACTS_SHOWN = 6;
const TABS = [["ads", "Ads"], ["heatmaps", "Heat maps"], ["analytics", "Analytics"]] as const;
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

/** Evolve, the "Breed the survivors" step after a rollout. The API no longer checks the token, so a tab without one sends "". */
function useEvolve(id: string, token: string | null, onEvolved: () => void): Breed {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  async function evolve() {
    setBusy(true);
    setFailure(null);
    try {
      const res = await fetchTyped("evolveCampaign", { params: { id }, body: { adminToken: token ?? "" } });
      if (!res.ok) throw new Error(res.error ?? "Evolve was refused.");
      onEvolved();
    } catch (e) {
      setFailure(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, failure, evolve: () => void evolve() };
}

function CampaignView() {
  const { id } = useParams<{ id: string }>();
  const adminToken = useAdminToken();
  const { data, error, reload } = useEndpoint("campaign", { params: { id } });
  const breed = useEvolve(id, adminToken, reload);
  const [picked, setPicked] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("ads");
  const router = useRouter();
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

  const views = c.generations.length > 0 && <>
      <div className="mt-10">
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
              className={`e-h -mb-px cursor-pointer border-b-2 pb-2.5 text-[24px] transition-colors duration-200 md:text-[32px] ${tab === key ? "border-ink text-ink" : "border-transparent text-[#8C8C8C] hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* Keyed by the tab, so switching tabs fades the new view in. */}
      <section key={tab} id="campaign-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="fk-blur-in mt-8">
        {tab === "analytics" ? (
          <Analytics campaign={c} />
        ) : tab === "heatmaps" ? (
          <Heatmaps campaign={c} />
        ) : (
          gen && (
            <Grid
              key={gen.gen}
              c={c}
              gen={gen}
              isLast={gen === c.generations.at(-1)}
              breed={breed}
              onNext={pick}
              onHeatmaps={() => setTab("heatmaps")}
              onOpen={(id) => router.push(adHref(c.id, id, gen.gen))}
            />
          )
        )}
      </section>
      </>;

  return (
    <div className="theme-e pb-16">
      <TopBar campaign={c} />
      {/* While a generation runs, the agent screen replaces the summary; earlier generations stay browsable below it. */}
      {running ? (
        <div className={`${WRAP} mt-8`}>
          <AgentRun c={c} />
          {error != null && <p className="mt-3 text-sm text-muted">Lost contact with the server. Retrying every 2 s.</p>}
          {c.generations.length > 0 && <div className="mt-12">{rail}</div>}
          {views}
        </div>
      ) : (
        <Summary c={c} gen={gen} rail={rail}>
          {c.stage === "error" && (
            <p role="alert" className="text-lg text-bad">This run stopped: {c.error ?? "no reason given"}. {c.generations.length ? "Breed the survivors again to retry." : "Start a new campaign to try again."}</p>
          )}
          {views}
        </Summary>
      )}
    </div>
  );
}

/**
 * The finished run, laid out like getgimmegimme.com's results: the pack card on the left, and on the right the title,
 * the rail, then the ads themselves (children), so the grid starts near the top. Sections fade up one after another.
 */
function Summary({ c, gen, rail, children }: { c: Campaign; gen: Generation | undefined; rail: ReactNode; children: ReactNode }) {
  const [allFacts, setAllFacts] = useState(false);
  const facts = c.product.facts;
  const n = gen?.ads.length ?? 0;
  const impressions = gen?.ads.reduce((sum, a) => sum + (a.experiment?.impressions ?? 0), 0) ?? 0;
  const title = !gen ? "This run stopped" : gen.gen === 0 ? `${n} ads ready for ${c.product.name || c.name}` : `${n} ads in generation ${gen.gen}`;
  const up = (i: number) => ({ className: "fk-pop", style: { "--d": `${i * 90}ms` } as CSSProperties });
  return (
    <section aria-label="Campaign" className={`${WRAP} mt-8 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]`}>
      <div className="flex min-w-0 flex-col gap-6 lg:col-start-2">
        <div {...up(0)}>
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div className="min-w-0 flex-[1_1_320px]">
              <h1 key={title} title={title} className="e-h fk-blur-in truncate text-[30px] md:text-[40px]">{title}</h1>
              {/* 40 = the backend's 4 panel segments x 10 personas. */}
              {gen && <p className="mt-1.5 text-[17px] text-muted">Screened by 40 AI shoppers{impressions > 0 && ` · ${impressions.toLocaleString("en-GB")} simulated impressions`}</p>}
            </div>
            {c.winnerId && (
              <Link href={`/campaigns/${encodeURIComponent(c.id)}/winner`} className="e-pill bg-ink text-white transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none">
                Meet the winner →
              </Link>
            )}
          </div>
        </div>
        <div {...up(1)}>{rail}</div>
        <div {...up(2)}>{children}</div>
      </div>
      <aside {...up(1)} className="fk-pop flex flex-col gap-4 lg:col-start-1 lg:row-start-1 lg:self-start">
        <div className="e-tile p-4">
          <StepBar at={gen ? RUN_STEPS.length : 0} f={0} />
          <p className="mt-3 text-[13px] text-muted">{gen ? `${n} ads ready` : "Stopped"}</p>
        </div>
        <div className="e-tile overflow-hidden">
          <img src={c.sourceImageUrl} alt="Your upload" className="block aspect-[4/3] w-full bg-track object-contain p-3" />
          <div className="flex flex-col gap-3 p-4">
            <div>
              <p className="font-medium">{c.name}</p>
              {c.product.price && <p className="text-sm text-muted">{c.product.price}</p>}
            </div>
            {facts.length > 0 && (
              <ul aria-label="Read off the pack" className="flex flex-wrap gap-1.5">
                {(allFacts ? facts : facts.slice(0, FACTS_SHOWN)).map((f, i) => <li key={i} className="rounded-full bg-track px-2.5 py-1 text-[12px] leading-tight">{f}</li>)}
                {facts.length > FACTS_SHOWN && (
                  <li>
                    <button type="button" aria-expanded={allFacts} onClick={() => setAllFacts(!allFacts)} className="cursor-pointer rounded-full px-2 py-1 text-[12px] leading-tight text-muted underline underline-offset-2 hover:text-ink">
                      {allFacts ? "Show less" : `+${facts.length - FACTS_SHOWN} more`}
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </section>
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
