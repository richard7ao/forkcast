"use client";
import { Segment, type Ad, type Campaign } from "@hack/contract";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorNote, Skeleton } from "../../../components/ui";
import { useEndpoint } from "../../../lib/useEndpoint";
import { LEVERS, LEVER_LABEL, allAds, fmtRate, sceneLabel, survived } from "./format";

const GEN_FILL = ["#C2E773", "#336138", "#7FB24E"];
const genFill = (gen: number) => GEN_FILL[Math.min(gen, 2)];
const RAMP = ["#F1F8E1", "#DCEFB6", "#C2E773", "#7FB24E", "#336138"];
const RAMP_LABEL = ["Under 20%", "20–39%", "40–59%", "60–79%", "80%+"];
const SEG_LABEL: Record<Segment, string> = {
  student: "Students", young_pro: "Young pros", parent: "Parents", fitness: "Fitness", other: "Other", judge: "Judges",
};
const AXIS_TICK = { fontSize: 12, fill: "#555555" };

type Row = { name: string; winner: boolean; gens: { gen: number; n: number; of: number }[] };

function Panel({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="e-tile flex min-w-0 flex-col gap-4 p-5 sm:p-7">
      <h3 className="e-h text-[28px] md:text-[40px]">{title}</h3>
      <p className="text-[15px] leading-snug text-muted">{caption}</p>
      {children}
    </section>
  );
}

/** Survivors out of tested ads, one bar per generation, on a shared 0–100% track so rows compare. */
function Bars({ rows, kind, gens }: { rows: Row[]; kind: string; gens: number[] }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-[18px] gap-y-2 text-[13px] text-muted">
        {gens.map((g) => (
          <span key={g} className="inline-flex items-center gap-2">
            <i aria-hidden className="inline-block h-2.5 w-[22px] rounded-r" style={{ background: genFill(g) }} />
            Gen {g} survivors
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-3 border-t border-line py-2.5 sm:grid-cols-[190px_minmax(0,1fr)]">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]">
            {r.name}
            {r.winner && <span className="rounded-full bg-pistachio px-2 py-0.5 text-xs font-medium">Winner&apos;s {kind}</span>}
          </span>
          <div
            role="img"
            aria-label={r.gens.map((g) => `Gen ${g.gen}: ${g.of ? `${g.n} of ${g.of} survivors` : "not tested"}.`).join(" ")}
            className="flex flex-col gap-1"
          >
            {r.gens.map((g) => (
              <span key={g.gen} aria-hidden className="flex items-center gap-2 text-xs tabular-nums">
                <span className="relative h-2.5 flex-1">
                  <span
                    className="absolute inset-y-0 left-0 rounded-r"
                    style={{ width: g.n ? `${(g.n / g.of) * 100}%` : g.of ? 2 : 0, background: g.n ? genFill(g.gen) : "#1D1D1D" }}
                  />
                </span>
                <span className="w-16 shrink-0">{g.of ? `${g.n} of ${g.of}` : "not tested"}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Analytics({ campaign }: { campaign: Campaign }) {
  const results = useEndpoint("results");
  if (!campaign.generations.length) return <p className="text-[15px] text-muted">Analytics appear once Gen 0 has been screened.</p>;

  const ads = allAds(campaign);
  const winner = ads.find((a) => a.id === campaign.winnerId);
  const gens = campaign.generations.map((g) => g.gen);
  const tally = (match: (a: Ad) => boolean) =>
    campaign.generations.map((g) => {
      const mine = g.ads.filter(match);
      return { gen: g.gen, n: mine.filter(survived).length, of: mine.length };
    });
  const total = (r: Row) => r.gens.reduce((s, g) => s + g.n, 0);
  const levers: Row[] = LEVERS.map((l) => ({ name: LEVER_LABEL[l], winner: winner?.lever === l, gens: tally((a) => a.lever === l) }));
  const scenes: Row[] = [...new Set(ads.map((a) => sceneLabel(a.scene)))]
    .map((s) => ({ name: s, winner: winner != null && sceneLabel(winner.scene) === s, gens: tally((a) => sceneLabel(a.scene) === s) }))
    .sort((a, b) => total(b) - total(a));

  // Rank 1 = fittest on each axis, over ads with enough people data to rank; ties keep list order.
  const tested = ads.filter((a) => a.fitness.ai?.rate != null && a.fitness.human?.rate != null && a.fitness.human.n >= 10);
  const rankBy = (rate: (a: Ad) => number) => new Map([...tested].sort((a, b) => rate(b) - rate(a)).map((a, i) => [a.id, i + 1]));
  const aiRank = rankBy((a) => a.fitness.ai?.rate ?? 0);
  const humanRank = rankBy((a) => a.fitness.human?.rate ?? 0);
  const points = tested.map((a) => ({ x: aiRank.get(a.id) ?? 0, y: humanRank.get(a.id) ?? 0, ad: a }));
  const n = points.length;
  const rho = 1 - (6 * points.reduce((s, p) => s + (p.x - p.y) ** 2, 0)) / (n * (n * n - 1));
  const ticks = points.map((_, i) => i + 1);

  const r = results.data;
  const segs = r ? Segment.options.filter((s) => r.cells.some((c) => c.segment === s)) : [];

  return (
    <div className="flex flex-col gap-10">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(560px,100%),1fr))] items-start gap-6">
        <Panel title="Which levers survive" caption="Share of each lever's ads that survived, per generation.">
          <Bars rows={levers} kind="lever" gens={gens} />
        </Panel>

        <Panel title="Which scenes survive" caption="Share of each scene's ads that survived. Later generations add scenes by mutation.">
          <Bars rows={scenes} kind="scene" gens={gens} />
        </Panel>

        <Panel title="AI shoppers vs humans" caption="Ranks of the ads tested with people, n ≥ 10 each. On the dashed line, AI shoppers and humans agree.">
          {n < 3 ? (
            <p className="text-[15px] text-muted">No ads tested with people yet. Ranks appear once at least 3 survivors have human results.</p>
          ) : (
            <>
              <div role="img" aria-label={`AI shoppers rank against humans rank for ${n} tested ads. Spearman rho ${rho.toFixed(2)}.`} className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 16, bottom: 28, left: 8 }}>
                    <CartesianGrid stroke="#EDEDED" />
                    <XAxis
                      type="number" dataKey="x" domain={[0.5, n + 0.5]} ticks={ticks} tick={AXIS_TICK}
                      label={{ value: "AI shoppers rank (1 = fittest)", position: "insideBottom", offset: -18, fontSize: 13, fill: "#1D1D1D" }}
                    />
                    <YAxis
                      type="number" dataKey="y" domain={[0.5, n + 0.5]} ticks={ticks} tick={AXIS_TICK} reversed
                      label={{ value: "Humans rank (1 = fittest)", angle: -90, position: "insideLeft", fontSize: 13, fill: "#1D1D1D" }}
                    />
                    <ReferenceLine segment={[{ x: 0.5, y: 0.5 }, { x: n + 0.5, y: n + 0.5 }]} stroke="#8C8C8C" strokeDasharray="6 6" />
                    <Tooltip
                      cursor={false}
                      content={({ payload }) => {
                        const p = payload?.[0]?.payload as (typeof points)[number] | undefined;
                        return p ? (
                          <div className="rounded-lg border border-edge bg-white px-3 py-2 text-[13px] leading-snug shadow-sm">
                            <p className="font-medium">{p.ad.headline}</p>
                            <p>AI shoppers, rank {p.x}: {p.ad.fitness.ai && fmtRate(p.ad.fitness.ai)}</p>
                            <p>Humans, rank {p.y}: {p.ad.fitness.human && fmtRate(p.ad.fitness.human)}</p>
                          </div>
                        ) : null;
                      }}
                    />
                    <Scatter data={points} fill="#6D3FD9" isAnimationActive={false} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[15px] text-muted">Spearman ρ {rho.toFixed(2)} across {n} tested ads.</p>
            </>
          )}
        </Panel>

        <Panel title="Tap intent by segment" caption="From the room round with real people. Cells with n < 10 claim nothing.">
          {results.error ? (
            <ErrorNote error={results.error} />
          ) : !r ? (
            <Skeleton rows={4} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[540px] table-fixed border-separate border-spacing-1 tabular-nums [&_td]:h-16 [&_td]:rounded-lg [&_td]:px-1 [&_td]:text-center [&_td]:align-middle [&_td]:text-xs [&_td]:leading-tight">
                  <thead>
                    <tr>
                      <th scope="col" className="w-[200px] px-0.5 py-1 text-left text-xs font-medium text-muted">Ad</th>
                      {segs.map((s) => (
                        <th key={s} scope="col" className="px-0.5 py-1 text-xs font-medium text-muted">{SEG_LABEL[s]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.variants.map((v) => {
                      const ad = ads.find((a) => a.id === v.variantId);
                      return (
                        <tr key={v.variantId}>
                          <th scope="row" className="pr-2 text-left text-[13px] font-normal leading-snug">
                            {ad ? `${LEVER_LABEL[ad.lever]}: ${ad.headline}` : `${LEVER_LABEL[v.lever]} (room test)`}
                          </th>
                          {segs.map((s) => {
                            const c = r.cells.find((x) => x.variantId === v.variantId && x.segment === s);
                            if (!c?.enough || c.human.rate == null) {
                              return <td key={s} className="bg-[#F7F7F7] text-muted">Insufficient evidence · n {c?.human.n ?? 0}</td>;
                            }
                            const q = Math.min(4, Math.floor(c.human.rate * 5));
                            return (
                              <td key={s} style={{ background: RAMP[q], color: q === 4 ? "#FFFFFF" : "#1D1D1D" }}>
                                {fmtRate(c.human)}
                                {c.ai != null && <span className="mt-0.5 block opacity-80">AI {Math.round(c.ai * 100)}%</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2 text-[13px] text-muted">
                <span>Tap intent</span>
                {RAMP.map((c, i) => (
                  <span key={c} className="inline-flex items-center gap-2">
                    <i aria-hidden className="inline-block size-2.5 ring-1 ring-black/10" style={{ background: c }} />
                    {RAMP_LABEL[i]}
                  </span>
                ))}
                <span className="inline-flex items-center gap-2">
                  <i aria-hidden className="inline-block size-2.5 bg-[#F7F7F7] ring-1 ring-black/10" />
                  Insufficient evidence (n &lt; 10)
                </span>
              </div>
            </>
          )}
        </Panel>
      </div>

      <p className="border-t border-line pt-[18px] text-sm leading-normal text-muted">
        AI fitness = synthetic shopper panel, sealed before people test. Simulated delivery is not real CTR. People = stated tap
        intent from EAT_HACK attendees (convenience sample).
      </p>
    </div>
  );
}
