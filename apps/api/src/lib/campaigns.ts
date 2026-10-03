import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Campaign, type Ad, type CreateCampaignRequest, type Generation } from "@hack/contract";
import { dataDir } from "../data/files";
import { breed, enrichFromCatalog, gen0, readPack, runExperiment, screen, sealGeneration, seedOf, type Progress } from "./evolve";
import { ensurePersonas, loadProduct } from "./forecast";
import { downscale } from "./image";
import { usageTotals } from "./llm";

/**
 * In-process campaign jobs. A campaign is DATA_DIR/campaigns/<id>.json, rewritten after every step so
 * GET /campaigns/:id can be polled; its images go to apps/web/public/generated/campaigns/<id>/.
 * ponytail: a restart mid-job leaves the file at its last stage; re-upload to retry.
 */
const PUBLIC_DIR = fileURLToPath(new URL("../../../web/public/", import.meta.url));
const ID = /^[a-z0-9-]{1,40}$/;
const READ_PX = 2048; // as scripts/extract-facts.ts: smaller loses the small print
const RENDER_PX = 1536; // as scripts/render-visual.ts

const campaignFile = (id: string) => join(dataDir(), "campaigns", `${id}.json`);
const urlPrefix = (id: string) => `/generated/campaigns/${id}`;
const publicPath = (url: string) => join(PUBLIC_DIR, url.replace(/^\/+/, ""));
const tokensUsed = () => usageTotals.promptTokens + usageTotals.completionTokens;

export function loadCampaign(id: string): Campaign | null {
  if (!ID.test(id) || !existsSync(campaignFile(id))) return null;
  return Campaign.parse(JSON.parse(readFileSync(campaignFile(id), "utf8")));
}

/** Write then rename, so a poll never reads half a file. */
function save(campaign: Campaign): Campaign {
  const file = campaignFile(campaign.id);
  mkdirSync(join(dataDir(), "campaigns"), { recursive: true });
  writeFileSync(`${file}.tmp`, `${JSON.stringify(campaign, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
  return campaign;
}

/** ponytail: one job per process (paid calls, one demo laptop); add a queue if campaigns ever need to overlap. */
let busy: string | null = null;

type Update = (patch: Partial<Campaign>) => void;
type Refusal = { status: 404 | 409; error: string };

/** Saves `start`, then runs `job` in the background; any throw becomes stage "error" with its message. */
function runJob(start: Campaign, job: (update: Update, current: () => Campaign) => Promise<void>) {
  let current = save(start);
  const update: Update = (patch) => {
    current = save({ ...current, ...patch });
  };
  busy = start.id;
  job(update, () => current)
    .catch((err: unknown) => {
      console.error(`campaign ${start.id} failed:`, err);
      update({ stage: "error", error: err instanceof Error ? err.message : String(err) });
    })
    .catch((err: unknown) => console.error(`campaign ${start.id}: could not save the error:`, err))
    .finally(() => {
      busy = null;
    });
}

/** Simulate, select and seal one generation, then append it and finish. */
function finishGeneration(update: Update, current: () => Campaign, gen: number, ads: Ad[], started: { at: number; tokens: number; imageTokens: number }) {
  update({ stage: "simulating", progress: { label: "Simulating 10,000 impressions", done: 0, total: 1 } });
  const { ads: tested, survivorIds, timeline } = runExperiment(gen, ads, seedOf(`${current().id}:${gen}:delivery`));
  update({ stage: "selecting", progress: { label: `Keeping the fittest ${survivorIds.length}`, done: 1, total: 1 } });
  const generation: Generation = {
    gen,
    ads: tested,
    survivorIds,
    sealedSha256: sealGeneration(gen, tested),
    tokens: tokensUsed() - started.tokens + started.imageTokens,
    seconds: Math.round((performance.now() - started.at) / 1000),
    timeline,
  };
  update({
    stage: "done",
    progress: { label: "Done", done: 1, total: 1 },
    generations: [...current().generations, generation],
    winnerId: gen > 0 ? survivorIds[0]! : null,
  });
}

const onProgress = (update: Update): Progress => (stage, label, done, total) => update({ stage, progress: { label, done, total } });

/** Saves the upload and starts reading -> writing -> rendering -> screening -> simulating -> selecting -> done. */
export function createCampaign(req: CreateCampaignRequest): { id: string } | Refusal {
  if (busy) return { status: 409, error: `campaign ${busy} is still running` };
  const [, type, base64] = /^data:image\/(jpeg|png);base64,(.+)$/.exec(req.imageDataUrl)!;
  const id = randomUUID().slice(0, 8);
  const sourceImageUrl = `${urlPrefix(id)}/source.${type === "png" ? "png" : "jpg"}`;
  mkdirSync(publicPath(urlPrefix(id)), { recursive: true });
  writeFileSync(publicPath(sourceImageUrl), Buffer.from(base64!, "base64"));

  const start: Campaign = {
    id,
    name: req.name ?? "New campaign",
    createdAt: new Date().toISOString(),
    sourceImageUrl,
    product: { brand: "", name: "", price: "", imageUrl: sourceImageUrl, facts: [] },
    stage: "reading",
    progress: { label: "Reading the pack", done: 0, total: 1 },
    generations: [],
    winnerId: null,
  };
  runJob(start, async (update, current) => {
    const started = { at: performance.now(), tokens: tokensUsed() };
    const read = await readPack(await downscale(publicPath(sourceImageUrl), READ_PX), sourceImageUrl);
    const catalog = loadProduct(dataDir()); // the brand catalog: DATA_DIR/product.json
    const product = enrichFromCatalog(read, catalog.placeholder ? null : catalog.product);
    const matched = product !== read;
    const label = matched ? `Matched catalog: ${product.brand} ${product.name}` : "Read the pack";
    if (matched) console.log(`campaign ${id}: ${label} (${read.facts.length} facts on the photo, ${product.facts.length} after the catalog)`);
    update({ product, name: req.name ?? `${product.brand} ${product.name}`.trim(), progress: { label, done: 1, total: 1 } });
    if (matched) await sleep(2000); // one 2 s poll, so the progress UI shows the match before "writing" replaces it
    const personas = await ensurePersonas(dataDir());
    const photo = await downscale(publicPath(sourceImageUrl), RENDER_PX);
    const { ads, imageTokens } = await gen0({ product, photo, outDir: publicPath(urlPrefix(id)), urlPrefix: urlPrefix(id), onProgress: onProgress(update) });
    const screened = await screen({ ads, product, personas, seed: seedOf(`${id}:0:panel`), onProgress: onProgress(update) });
    finishGeneration(update, current, 0, screened, { ...started, imageTokens });
  });
  return { id };
}

/** Breeds the latest generation's survivors into the next one, then screens and simulates parents and children together. */
export function evolveCampaign(id: string): { campaign: Campaign } | Refusal {
  const campaign = loadCampaign(id);
  if (!campaign) return { status: 404, error: "no such campaign" };
  if (busy) return { status: 409, error: `campaign ${busy} is still running` };
  const last = campaign.generations.at(-1);
  // "error" too: a failed evolve keeps its earlier generations, so it can simply be retried.
  if (!(campaign.stage === "done" || campaign.stage === "error") || !last) return { status: 409, error: `campaign is ${campaign.stage}, not done` };

  const gen = last.gen + 1;
  const survivors = last.survivorIds.map((sid) => ({ ...last.ads.find((a) => a.id === sid)!, experiment: null, status: "screening" as const }));
  const start: Campaign = { ...campaign, stage: "writing", progress: { label: `Breeding generation ${gen}`, done: 0, total: 1 }, error: undefined };
  runJob(start, async (update, current) => {
    const started = { at: performance.now(), tokens: tokensUsed() };
    const personas = await ensurePersonas(dataDir());
    const photo = await downscale(publicPath(campaign.sourceImageUrl), RENDER_PX);
    const { product } = campaign;
    const { ads, imageTokens } = await breed({ gen, survivors, product, photo, outDir: publicPath(urlPrefix(id)), urlPrefix: urlPrefix(id), onProgress: onProgress(update) });
    // Survivors are re-screened with their children (the same 40 panel calls): their old rates won them selection,
    // so keeping them would hand every parent a winner's-curse edge over its children.
    const screened = await screen({ ads: [...survivors, ...ads], product, personas, seed: seedOf(`${id}:${gen}:panel`), onProgress: onProgress(update) });
    finishGeneration(update, current, gen, screened, { ...started, imageTokens });
  });
  return { campaign: start };
}
