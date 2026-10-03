"use client";
import { useState, type ReactNode } from "react";
import type { Ad, Campaign } from "@hack/contract";
import { allAds, audienceGrid, firstCopies, fmtCtr, fmtRate, LEVER_LABEL, leverSceneGrid, sceneLabel, STATUS_LABEL } from "./format";

const SEG_LABEL = { student: "Students", young_pro: "Young professionals", parent: "Parents", fitness: "Fitness" } as const;
const PALE = "#F1F8E1";
const STRONG = "#336138";

/** Pale lime to forest green. Each map scales to its own best cell, so the strongest combination always reads darkest. */
const heat = (t: number) => ({
  background: `color-mix(in oklab, ${STRONG} ${Math.round(Math.max(0, Math.min(1, t)) * 100)}%, ${PALE})`,
  color: t > 0.55 ? "#FFFFFF" : "#1D1D1D",
});

export function Panel({ title, caption, children }: { title: string; caption: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="e-tile flex min-w-0 flex-col gap-4 p-5 sm:p-7">
      <h3 className="e-h text-[28px] md:text-[40px]">{title}</h3>
      <p className="text-[15px] leading-snug text-muted">{caption}</p>
      {children}
    </section>
  );
}

function Legend({ low, high }: { low: string; high: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[13px] text-muted">
      <span>{low}</span>
      <i aria-hidden className="inline-block h-2.5 w-32 rounded-full" style={{ background: `linear-gradient(90deg, ${PALE}, ${STRONG})` }} />
      <span>{high}</span>
    </div>
  );
}

/** "Which performed best": the lever × scene grid from gen 0, and which audience each lever reaches. */
export function Heatmaps({ campaign }: { campaign: Campaign }) {
  return (
    <div className="grid gap-6">
      <LeverScene campaign={campaign} />
      <Audience ads={firstCopies(allAds(campaign))} />
    </div>
  );
}

function LeverScene({ campaign }: { campaign: Campaign }) {
  const [hot, setHot] = useState<Ad | null>(null);
  const g0 = campaign.generations[0];
  if (!g0) return null;
  const { scenes, rows, best } = leverSceneGrid(g0.ads);
  const top = Math.max(0, ...g0.ads.map((a) => a.experiment?.ctr ?? 0)) || 1;
  const shown = hot ?? best;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  return (
    <Panel
      title="Which lever × scene won"
      caption={`Simulated CTR for every lever in every scene, Gen 0.${campaign.generations.length > 1 ? " Later generations mutate the survivors, so they don't fill this grid." : ""} Outlined: the simulation's top pick. Dimmed: cut.`}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] table-fixed border-separate border-spacing-1 tabular-nums">
          <thead>
            <tr>
              <th scope="col" className="w-[104px]"><span className="sr-only">Lever</span></th>
              {scenes.map((s) => (
                <th key={s} scope="col" className="px-0.5 pb-1 text-left align-bottom text-[11px] font-medium leading-tight text-muted">{sceneLabel(s)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.lever}>
                <th scope="row" className="pr-2 text-left text-[13px] font-normal">{LEVER_LABEL[r.lever]}</th>
                {r.cells.map((a, i) => (
                  <td key={scenes[i]} className="h-11 p-0">
                    {a?.experiment ? (
                      // A button, so tapping on a phone shows the same detail line that hovering does.
                      <button
                        type="button"
                        onMouseEnter={() => setHot(a)}
                        onFocus={() => setHot(a)}
                        onClick={() => setHot(a)}
                        aria-label={`${LEVER_LABEL[a.lever]} × ${sceneLabel(a.scene)}: simulated CTR ${pct(a.experiment.ctr)}, ${STATUS_LABEL[a.status]}`}
                        className={`size-full cursor-pointer rounded-md text-xs ${a.id === best?.id ? "ring-2 ring-ink ring-offset-2" : ""} ${a.status === "culled" ? "opacity-40" : ""} ${a.id === hot?.id ? "outline-2 outline-ai" : ""}`}
                        style={heat(a.experiment.ctr / top)}
                      >
                        {pct(a.experiment.ctr)}
                      </button>
                    ) : (
                      <span className="block size-full rounded-md bg-[#F7F7F7]" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown?.experiment && (
        <p aria-live="polite" className="min-h-[3.2em] text-[13px] leading-snug">
          <span className="text-muted">{shown === best ? "Top pick" : `${LEVER_LABEL[shown.lever]} × ${sceneLabel(shown.scene)}`} · {STATUS_LABEL[shown.status]}</span>
          <br />
          <span className="font-medium">“{shown.headline}”</span> Simulated CTR {fmtCtr(shown.experiment)}
          {shown.fitness.ai && <> · AI shoppers {fmtRate(shown.fitness.ai)}</>}
        </p>
      )}
      <Legend low="0%" high={`${pct(top)} simulated CTR`} />
    </Panel>
  );
}

function Audience({ ads }: { ads: Ad[] }) {
  const { levers, rows } = audienceGrid(ads);
  const values = rows.flatMap((r) => r.cells.filter((x): x is number => x != null));
  const top = Math.max(0, ...values) || 1;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <Panel title="Which audience taps" caption="AI shopper panel, P(tap): each lever's mean across its ads, per audience. Outlined: the strongest pairing.">
      {values.length === 0 ? (
        <p className="text-[15px] text-muted">This run has no per-audience scores.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] max-w-[760px] table-fixed border-separate border-spacing-1 tabular-nums">
              <thead>
                <tr>
                  <th scope="col" className="w-[96px]"><span className="sr-only">Audience</span></th>
                  {levers.map((l) => (
                    <th key={l} scope="col" className="px-0.5 pb-1 text-left align-bottom text-[11px] font-medium leading-tight text-muted">{LEVER_LABEL[l]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.seg}>
                    <th scope="row" className="pr-2 text-left text-[13px] font-normal leading-tight">{SEG_LABEL[r.seg]}</th>
                    {r.cells.map((x, i) => (
                      <td
                        key={levers[i]}
                        title={x == null ? undefined : `${SEG_LABEL[r.seg]} × ${LEVER_LABEL[levers[i]!]}: AI shoppers P(tap) ${pct(x)}`}
                        className={`h-11 rounded-md p-0 text-center text-xs ${x != null && x === top ? "ring-2 ring-ink ring-offset-2" : ""}`}
                        style={x == null ? { background: "#F7F7F7" } : heat(x / top)}
                      >
                        {x == null ? "–" : pct(x)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Legend low="0%" high={`${pct(top)} P(tap)`} />
        </>
      )}
    </Panel>
  );
}
