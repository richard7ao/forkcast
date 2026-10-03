"use client";

/**
 * /watch-humans/analytics: mocked consumer insights on a campaign's finalists, as Watch Humans would report them
 * to the brand. The finalists are real; every audience number comes from ../insights (seeded, so stable per
 * campaign). ?c=<campaign id>, default demo-epic.
 */
import Link from "next/link";
import { Fragment, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { Campaign } from "@hack/contract";
import { ErrorNote, Skeleton } from "../../../components/ui";
import { useEndpoint } from "../../../lib/useEndpoint";
import { buildAnalytics, clock, DAYS, pct, type FinalistStat, type Share } from "../insights";
import m from "../motion.module.css";

const INK = "#1D1D1D";
const FOREST = "#336138";
const TRACK = "#EDEDED";
const DONUT = ["#336138", "#7FB24E", "#C2E773", "#C9C9CF"];
const RAMP = ["#F1F8E1", "#DCEFB6", "#C2E773", "#7FB24E", "#336138"];
const GENDER_SHORT = ["Female", "Male", "Non-binary", "Not said"];
const AGE_SHORT = ["18–24", "25–34", "35–44", "45–54", "55+"];
const fmt = (n: number) => n.toLocaleString("en-GB");
const whole = (n: number) => fmt(Math.round(n));
const minSec = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;
const COUNT_MS = 1100;
/** Borderless card: a soft shadow instead of the theme's hairline, and a lift on hover. */
const TILE = `e-tile border-transparent shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-18px_rgba(0,0,0,0.14)] ${m.lift}`;
const delay = (i: number, step: number) => ({ animationDelay: `${i * step}ms` });

export default function AnalyticsPage() {
  // useSearchParams needs a Suspense boundary when Next prerenders the page.
  return (
    <Suspense>
      <Load />
    </Suspense>
  );
}

function Load() {
  const id = useSearchParams().get("c") ?? "demo-epic";
  const { data, error, reload } = useEndpoint("campaign", { params: { id } });
  return (
    <div className="theme-e pb-16">
      <main className="mx-auto w-full max-w-6xl space-y-14 px-4 py-8 md:py-12">
        <Link href={`/watch-humans?c=${encodeURIComponent(id)}`} className="e-mono text-[13px] uppercase tracking-wider text-muted hover:text-ink">
          ← Back to swiping
        </Link>
        {data ? (
          <Dashboard campaign={data.campaign} />
        ) : error ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-lg font-medium">Could not load campaign &quot;{id}&quot;.</p>
            <ErrorNote error={error} />
            <button type="button" onClick={() => reload()} className="e-pill e-outline">Try again</button>
          </div>
        ) : (
          <Skeleton rows={6} />
        )}
      </main>
    </div>
  );
}

function Dashboard({ campaign }: { campaign: Campaign }) {
  const a = useMemo(() => buildAnalytics(campaign), [campaign]);
  const { brand, name } = campaign.product;
  const n = a.finalists.length;
  const header = (
    <header className={`space-y-3 ${m.rise}`}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="e-h text-[36px] md:text-[56px]">Customer analytics</h1>
        <span className="e-mono rounded-full bg-white px-3 py-1 text-[12px] uppercase tracking-wider text-muted">Mock data</span>
      </div>
      <p className="text-[17px] text-muted">
        {brand} {name} · Watch Humans members who swiped the {n} finalist {n === 1 ? "ad" : "ads"} before claiming a sample
      </p>
    </header>
  );
  if (n === 0) {
    return (
      <>
        {header}
        <p className="text-muted">No finalists yet: this campaign is still running.</p>
      </>
    );
  }
  const leadRate = Math.max(...a.finalists.map((f) => f.rate));
  return (
    <>
      {header}
      <section aria-label="Headline numbers" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi i={1} label="Members reached" value={a.members} format={whole} note="swiped every finalist" />
        <Kpi i={2} label="Swipes" value={a.swipes} format={whole} note={`${fmt(a.members)} × ${n} finalists`} />
        <Kpi i={3} label="Right-swipe rate" value={a.rights / a.swipes} format={pct} note={`${fmt(a.rights)} would tap`} />
        <Kpi i={4} label="Samples claimed" value={a.samples} format={whole} note={`${pct(a.samples / a.members)} of members`} />
        <Kpi i={5} label="Video reviews" value={a.videos} format={whole} note={`${pct(a.videos / a.samples)} of samples`} />
        <Kpi i={6} label="Avg watch time" value={a.watchSec} format={minSec} note="per review video" />
      </section>

      <Section label="What stands out">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {a.insights.map((insight, i) => (
            <article key={insight.title} className={`${TILE} flex flex-col gap-2 p-6 ${m.rise}`} style={delay(i + 1, 90)}>
              <h3 className="text-[18px] font-medium leading-snug">{insight.title}</h3>
              <p className="text-[15px] leading-snug text-muted">{insight.body}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section label="Demographics">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Age">
            <div role="img" aria-label={a.age.map((s) => `${s.label} ${s.pct}%`).join(", ")} className={`h-56 ${m.bars}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={a.age.map((s) => ({ ...s, text: `${s.pct}%` }))} margin={{ top: 22, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#555555" }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis hide />
                  <Bar dataKey="pct" fill={FOREST} radius={[6, 6, 0, 0]} isAnimationActive={false}>
                    <LabelList dataKey="text" position="top" fontSize={13} fill={INK} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Gender">
            <div className="flex flex-wrap items-center gap-5">
              <div role="img" aria-label={a.gender.map((s) => `${s.label} ${s.pct}%`).join(", ")} className={`size-40 shrink-0 ${m.donut}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={a.gender} dataKey="count" nameKey="label" innerRadius="62%" outerRadius="100%" stroke="#FFFFFF" strokeWidth={2} isAnimationActive={false}>
                      {a.gender.map((s, i) => <Cell key={s.label} fill={DONUT[i]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="min-w-0 flex-1 space-y-2 text-[14px]">
                {a.gender.map((s, i) => (
                  <li key={s.label} className="flex items-center gap-2">
                    <i aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: DONUT[i] }} />
                    <span className="flex-1">{s.label}</span>
                    <span className="tabular-nums">{s.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
          <Card title="UK region">
            <ShareBars shares={a.region} />
          </Card>
        </div>
      </Section>

      <Section label="Household and lifestyle">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card title="Household"><ShareBars shares={a.household} /></Card>
          <Card title="Main dietary preference"><ShareBars shares={a.diet} /></Card>
          <Card title="Grocery shopping"><ShareBars shares={a.shopping} /></Card>
          <Card title="Preferred store"><ShareBars shares={a.store} /></Card>
          <Card title="Device"><ShareBars shares={a.device} /></Card>
        </div>
      </Section>

      <Section label="Ad performance by audience">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Right-swipe rate by finalist" className="lg:col-span-2">
            <ul className="space-y-4">
              {a.finalists.map((f, i) => (
                <li key={f.id} className="flex items-center gap-3">
                  <img src={f.imageUrl} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="flex flex-wrap items-center gap-x-2 text-[15px] font-medium leading-snug">
                      {f.headline}
                      {f.aiWinner && <Tag>AI winner</Tag>}
                      {f.rate === leadRate && <Tag>Members&apos; pick</Tag>}
                    </p>
                    <div className="flex items-center gap-3">
                      <div aria-hidden className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: TRACK }}>
                        <div className={`h-full rounded-full ${m.grow}`} style={{ width: pct(f.rate), background: FOREST, ...delay(i, 90) }} />
                      </div>
                      <span className="w-28 shrink-0 text-right text-[14px] tabular-nums">
                        {pct(f.rate)} <span className="text-muted">· {fmt(f.rights)}</span>
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="By age band" caption="Right-swipe rate per finalist and age band.">
            <RateGrid rows={a.finalists} cols={a.age} short={AGE_SHORT} values={a.byAge} />
          </Card>
          <Card title="By gender" caption="Right-swipe rate per finalist and gender. Small groups swing more.">
            <RateGrid rows={a.finalists} cols={a.gender} short={GENDER_SHORT} values={a.byGender} />
          </Card>
        </div>
      </Section>

      <Section label="When they swipe">
        <Card title="Swipes by day and hour" caption="Every swipe in the campaign, by the member's local time.">
          <WhenGrid when={a.when} />
        </Card>
      </Section>
    </>
  );
}

/** Fades up, and starts the animations inside it, once it scrolls into view. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setSeen(true);
        io.disconnect();
      }
    }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section ref={ref} aria-label={label} className={`space-y-5 ${m.reveal} ${seen ? m.in : ""}`}>
      <h2 className="e-lbl">{label}</h2>
      {children}
    </section>
  );
}

function Card({ title, caption, className = "", children }: { title: string; caption?: string; className?: string; children: ReactNode }) {
  return (
    <div className={`${TILE} flex min-w-0 flex-col gap-5 p-6 ${className}`}>
      <div className="space-y-1">
        <h3 className="text-[17px] font-medium">{title}</h3>
        {caption && <p className="text-[14px] leading-snug text-muted">{caption}</p>}
      </div>
      {children}
    </div>
  );
}

function Kpi({ i, label, value, format, note }: { i: number; label: string; value: number; format: (n: number) => string; note: string }) {
  return (
    <div className={`${TILE} min-w-0 space-y-1 p-5 ${m.rise}`} style={delay(i, 60)}>
      <p className="e-mono text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <p className="e-h text-[32px] tabular-nums">
        <CountUp to={value} format={format} />
      </p>
      <p className="truncate text-[13px] text-muted">{note}</p>
    </div>
  );
}

/** Counts from 0 up to `to` with an ease-out; shows the final value at once under reduced motion. */
function CountUp({ to, format }: { to: number; format: (n: number) => string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(to);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / COUNT_MS);
      setV(to * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{format(v)}</>;
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="e-mono rounded-full bg-[#C2E773] px-2 py-0.5 text-[11px] font-normal uppercase tracking-wider">{children}</span>;
}

function ShareBars({ shares }: { shares: Share[] }) {
  const max = Math.max(...shares.map((s) => s.pct), 1);
  return (
    <ul className="space-y-2.5">
      {shares.map((s, i) => (
        <li key={s.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.75rem] items-center gap-3 text-[14px]">
          <span className="truncate">{s.label}</span>
          <div aria-hidden className="h-2 overflow-hidden rounded-full" style={{ background: TRACK }}>
            <div className={`h-full rounded-full ${m.grow}`} style={{ width: `${(s.pct / max) * 100}%`, background: FOREST, ...delay(i, 60) }} />
          </div>
          <span className="text-right tabular-nums" title={`${fmt(s.count)} members`}>{s.pct}%</span>
        </li>
      ))}
    </ul>
  );
}

/** Ramp step for v within [lo, hi]; the two dark steps take white text. */
function shade(v: number, lo: number, hi: number) {
  const step = hi > lo ? Math.min(RAMP.length - 1, Math.floor(((v - lo) / (hi - lo)) * RAMP.length)) : 2;
  return { background: RAMP[step], color: step >= 3 ? "#FFFFFF" : INK };
}

function RateGrid({ rows, cols, short, values }: { rows: FinalistStat[]; cols: Share[]; short: string[]; values: number[][] }) {
  const flat = values.flat();
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `minmax(0,1.5fr) repeat(${cols.length}, minmax(0,1fr))` }}>
      <span />
      {cols.map((c, i) => (
        <span key={c.label} className="pb-1 text-center text-[11px] leading-tight text-muted">
          {short[i]}
          <br />
          <span className="tabular-nums">n {fmt(c.count)}</span>
        </span>
      ))}
      {rows.map((r, f) => (
        <Fragment key={r.id}>
          <span className="flex min-w-0 items-center gap-2 pr-1">
            <img src={r.imageUrl} alt="" className="size-7 shrink-0 rounded object-cover" />
            <span className="truncate text-[13px]" title={r.headline}>{r.headline}</span>
          </span>
          {(values[f] ?? []).map((v, i) => (
            <span key={cols[i]?.label} className={`rounded-md py-2 text-center text-[12px] tabular-nums ${m.pop}`} style={{ ...shade(v, lo, hi), ...delay(f + i, 50) }}>
              {pct(v)}
            </span>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

function WhenGrid({ when }: { when: number[][] }) {
  const max = Math.max(...when.flat(), 1);
  return (
    <div className="space-y-3">
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: "2.25rem repeat(24, minmax(0,1fr))" }}>
        {when.map((row, d) => (
          <Fragment key={DAYS[d]}>
            <span className="self-center text-[11px] text-muted">{DAYS[d]?.slice(0, 3)}</span>
            {row.map((n, h) => (
              <span
                key={h}
                title={`${DAYS[d]} ${clock(h)}: ${fmt(n)} swipes`}
                className={`h-4 rounded-[3px] sm:h-6 ${m.pop}`}
                style={{ background: n ? shade(n, 0, max).background : "#F6F6F7", ...delay(d + h, 15) }}
              />
            ))}
          </Fragment>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="text-[10px] text-muted">{h % 6 === 0 ? clock(h).slice(0, 2) : ""}</span>
        ))}
      </div>
      <div className="flex items-center gap-2.5 text-[13px] text-muted">
        <span>Fewer</span>
        <i aria-hidden className="inline-block h-2.5 w-32 rounded-full" style={{ background: `linear-gradient(90deg, ${RAMP[0]}, ${RAMP[4]})` }} />
        <span>More swipes</span>
      </div>
    </div>
  );
}
