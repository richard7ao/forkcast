"use client";
import type { Ad, Campaign } from "@hack/contract";
import { LEVERS, LEVER_LABEL, allAds, sceneLabel, survived } from "./format";
import { Panel } from "./Heatmaps";

const GEN_FILL = ["#C2E773", "#336138", "#7FB24E"];
const genFill = (gen: number) => GEN_FILL[Math.min(gen, 2)];

type Row = { name: string; winner: boolean; gens: { gen: number; n: number; of: number }[] };

/** A row with no ads in a generation: it died out earlier, or it only appears later. */
const absent = (r: Row, gen: number) => (r.gens.some((g) => g.gen < gen && g.of > 0) ? "extinct" : "not yet");

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
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-3 border-t border-line py-2.5 sm:grid-cols-[190px_minmax(0,1fr)]">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]">
            {r.name}
            {r.winner && <span className="rounded-full bg-pistachio px-2 py-0.5 text-xs font-medium">Winner&apos;s {kind}</span>}
          </span>
          <div
            role="img"
            aria-label={r.gens.map((g) => `Gen ${g.gen}: ${g.of ? `${g.n} of ${g.of} survivors` : absent(r, g.gen)}.`).join(" ")}
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
                <span className="w-16 shrink-0">{g.of ? `${g.n} of ${g.of}` : absent(r, g.gen)}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The AI run's analytics: which levers and scenes made it through each generation's cull. */
export function Analytics({ campaign }: { campaign: Campaign }) {
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
  // A scene is a rendered image: copy mutations reuse their parent's image, scene mutations get a new one.
  const sceneOf = (a: Ad) => a.imageUrl ?? a.scene;
  const scenes: Row[] = [...new Map(ads.map((a) => [sceneOf(a), a.scene])).entries()]
    .map(([key, prompt]) => ({ name: sceneLabel(prompt), winner: winner != null && sceneOf(winner) === key, gens: tally((a) => sceneOf(a) === key) }))
    .sort((a, b) => total(b) - total(a));

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] items-start gap-6">
      <Panel title="Which levers survive" caption="Share of each lever's ads that survived, per generation.">
        <Bars rows={levers} kind="lever" gens={gens} />
      </Panel>
      <Panel title="Which scenes survive" caption="Share of each scene's ads that survived. Later generations add scenes by mutation.">
        <Bars rows={scenes} kind="scene" gens={gens} />
      </Panel>
    </div>
  );
}
