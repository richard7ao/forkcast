"use client";

/**
 * /lab: a test harness for every backend flow, on the test-ui branch only (never merged; not product UI).
 * Upload -> live progress -> generation tables -> evolve (admin) -> winner -> Meta CSV -> Watch Humans swipe.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Ad, Campaign, Generation } from "@hack/contract";
import { fetchTyped } from "../../lib/client";

const DEMO_ID = "demo-epic";
// The committed EPIC pack photo: uploading these exact bytes reuses the demo run's renders (render cache).
const DEMO_PHOTO = "/generated/campaigns/d87ed849/source-crop.jpg";
const pct = (x: number | null | undefined) => (x == null ? "–" : `${(x * 100).toFixed(1)}%`);
const BTN = "rounded-md bg-accent px-3 py-1.5 font-semibold text-bg disabled:opacity-40";
const INPUT = "rounded-md border border-edge bg-bg px-2 py-1.5";
const LINK = "text-accent underline";

export default function Lab() {
  const [id, setId] = useState(DEMO_ID);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const note = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, 40));

  const load = useCallback(async (campaignId: string) => {
    try {
      const { campaign } = await fetchTyped("campaign", { params: { id: campaignId } });
      setCampaign(campaign);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => void load(DEMO_ID), [load]);

  // Poll every 2 s while a job runs, as the contract says.
  const running = !!campaign && campaign.stage !== "done" && campaign.stage !== "error";
  useEffect(() => {
    if (!running || !campaign) return;
    const timer = setInterval(() => void load(campaign.id), 2000);
    return () => clearInterval(timer);
  }, [running, campaign, load]);

  const lastLine = useRef("");
  useEffect(() => {
    if (!campaign) return;
    const line = `${campaign.id} ${campaign.stage}: ${campaign.progress.label} ${campaign.progress.done}/${campaign.progress.total}`;
    if (line !== lastLine.current) {
      lastLine.current = line;
      note(line);
    }
  }, [campaign]);

  async function upload(file: File) {
    setError(null);
    const imageDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    try {
      // No name: the API names the campaign after the pack it reads.
      const out = await fetchTyped("createCampaign", { body: { imageDataUrl } });
      if (!out.ok || !out.campaignId) return setError(out.error ?? "create failed");
      note(`created ${out.campaignId} from ${file.name} (${Math.round(file.size / 1024)} KB)`);
      setId(out.campaignId);
      await load(out.campaignId);
    } catch (e) {
      setError(String(e));
    }
  }

  async function runDemoPath() {
    const blob = await fetch(DEMO_PHOTO).then((r) => r.blob());
    await upload(new File([blob], "EPIC demo path.jpg", { type: "image/jpeg" }));
  }

  async function evolve() {
    if (!campaign) return;
    setError(null);
    try {
      const out = await fetchTyped("evolveCampaign", { params: { id: campaign.id }, body: { adminToken: token } });
      if (!out.ok) return setError(out.error ?? "evolve failed");
      note(`evolve started on ${campaign.id}`);
      if (out.campaign) setCampaign(out.campaign);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 text-sm">
      <h1 className="text-xl font-semibold">Forkcast lab: test every flow</h1>
      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-edge bg-panel p-3">
        <label className="flex flex-col gap-1">
          Campaign id
          <input className={INPUT} value={id} onChange={(e) => setId(e.target.value.trim())} />
        </label>
        <button type="button" className={BTN} onClick={() => void load(id)}>
          Load
        </button>
        <button type="button" className={BTN} disabled={running} onClick={() => void runDemoPath()}>
          1a. Run demo path (reuses renders)
        </button>
        <label className="flex flex-col gap-1">
          1b. New product: upload a pack photo (jpeg or png)
          <input
            type="file"
            accept="image/jpeg,image/png"
            disabled={running}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
        </label>
        <label className="flex flex-col gap-1">
          Admin token (evolve)
          <input className={INPUT} type="password" value={token} onChange={(e) => setToken(e.target.value)} />
        </label>
        <button type="button" className={BTN} disabled={!campaign || !token || campaign.stage !== "done"} onClick={() => void evolve()}>
          2. Evolve
        </button>
      </section>
      {error && <p className="rounded-md border border-bad p-2 text-bad">{error}</p>}
      {campaign && <CampaignView campaign={campaign} />}
      <section className="rounded-lg border border-edge bg-panel p-3">
        <h2 className="mb-2 font-semibold">Log</h2>
        <pre className="whitespace-pre-wrap text-xs text-muted">{log.join("\n") || "nothing yet"}</pre>
      </section>
    </main>
  );
}

function CampaignView({ campaign }: { campaign: Campaign }) {
  const winner = campaign.generations.at(-1)?.ads.find((ad) => ad.id === campaign.winnerId);
  const { done, total } = campaign.progress;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-4 rounded-lg border border-edge bg-panel p-3">
        <img src={campaign.sourceImageUrl} alt="" className="size-24 rounded object-cover" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-base font-semibold">
            {campaign.name} <span className="text-muted">({campaign.id})</span>
          </p>
          <p>
            Stage <b>{campaign.stage}</b>: {campaign.progress.label} {done}/{total}
            {campaign.error && <span className="text-bad"> error: {campaign.error}</span>}
          </p>
          <div className="h-1.5 w-64 overflow-hidden rounded-full bg-edge">
            <div className="h-full bg-accent" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
          <p>Winner: {winner ? `"${winner.headline}" (${winner.id})` : "none yet"}</p>
          <p className="flex flex-wrap gap-3">
            <a className={LINK} href={`/api/campaigns/${campaign.id}/meta.csv`} download={`forkcast-${campaign.id}-meta.csv`}>
              3. Export Meta CSV
            </a>
            <a className={LINK} href={`/watch-humans?c=${campaign.id}`} target="_blank">
              4. Watch Humans swipe
            </a>
            <a className={LINK} href={`/api/campaigns/${campaign.id}`} target="_blank">
              Raw JSON
            </a>
            <a className={LINK} href="/vote-lite" target="_blank">
              Room test (/vote-lite)
            </a>
            <a className={LINK} href="/api/results" target="_blank">
              Room results JSON
            </a>
          </p>
        </div>
        <ul className="flex max-w-sm flex-wrap content-start gap-1">
          {campaign.product.facts.map((fact) => (
            <li key={fact} className="rounded-full border border-edge px-2 py-0.5 text-xs">
              {fact}
            </li>
          ))}
        </ul>
      </div>
      {[...campaign.generations].reverse().map((gen) => (
        <GenerationTable key={gen.gen} gen={gen} winnerId={campaign.winnerId} />
      ))}
    </section>
  );
}

function bestAudience(ad: Ad): string {
  const entries = Object.entries(ad.fitness.aiBySegment ?? {});
  if (!entries.length) return "–";
  const [segment, p] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  return `${segment} ${pct(p)}`;
}

function GenerationTable({ gen, winnerId }: { gen: Generation; winnerId: string | null }) {
  const ads = [...gen.ads].sort((a, b) => (b.experiment?.ctr ?? -1) - (a.experiment?.ctr ?? -1));
  return (
    <div className="rounded-lg border border-edge bg-panel p-3">
      <p className="mb-2 font-semibold">
        Generation {gen.gen}: {gen.ads.length} ads, {gen.survivorIds.length} survivors, {gen.tokens.toLocaleString()} tokens, {gen.seconds}s,{" "}
        {gen.timeline.length} budget snapshots, sha256 {gen.sealedSha256?.slice(0, 12) ?? "unsealed"}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-muted">
            <tr>
              <th className="p-1">Ad</th>
              <th className="p-1">Status</th>
              <th className="p-1">Lever</th>
              <th className="p-1">Headline / body</th>
              <th className="p-1">AI panel</th>
              <th className="p-1">Best audience</th>
              <th className="p-1">Sim. CTR (clicks/impr.)</th>
              <th className="p-1">Parents</th>
            </tr>
          </thead>
          <tbody>
            {ads.map((ad) => (
              <tr key={ad.id} className={`border-t border-edge ${ad.status === "culled" ? "opacity-50" : ""}`}>
                <td className="p-1">
                  <img src={ad.imageUrl} alt="" className="size-12 rounded object-cover" />
                </td>
                <td className="p-1 font-semibold">{ad.id === winnerId ? "WINNER" : ad.status}</td>
                <td className="p-1">{ad.lever}</td>
                <td className="max-w-md p-1">
                  <b>{ad.headline}</b> <span className="text-muted">{ad.body}</span> [{ad.cta}]
                </td>
                <td className="p-1 tabular-nums">{ad.fitness.ai ? `${ad.fitness.ai.taps}/${ad.fitness.ai.n} ${pct(ad.fitness.ai.rate)}` : "–"}</td>
                <td className="p-1">{bestAudience(ad)}</td>
                <td className="p-1 tabular-nums">
                  {ad.experiment ? `${pct(ad.experiment.ctr)} (${ad.experiment.clicks}/${ad.experiment.impressions})` : "–"}
                </td>
                <td className="p-1 text-muted">{ad.parentIds.join(", ") || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
