import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { campaignsRoutes } from "./campaigns";

// dataDir() reads DATA_DIR per request, so a scratch copy of the demo campaign stands in for live data.
const fixture = JSON.parse(readFileSync(new URL("../../../../fixtures/campaigns.json", import.meta.url), "utf8")).campaigns[0];
const dir = mkdtempSync(join(tmpdir(), "forkcast-campaigns-"));
mkdirSync(join(dir, "campaigns"));
writeFileSync(join(dir, "campaigns", `${fixture.id}.json`), JSON.stringify(fixture));
process.env.DATA_DIR = dir;
after(() => rmSync(dir, { recursive: true, force: true }));

test("a brand downloads the last generation's survivors and winner as a Meta bulk-import CSV", async () => {
  const res = await campaignsRoutes.request(`/campaigns/${fixture.id}/meta.csv`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /^text\/csv/);
  assert.equal(res.headers.get("content-disposition"), `attachment; filename="forkcast-${fixture.id}-meta.csv"`);
  const lines = (await res.text()).split("\r\n");
  const finalists = fixture.generations.at(-1).ads.filter((ad: { status: string }) => ad.status === "survivor" || ad.status === "winner");
  assert.equal(lines.length, 1 + finalists.length); // header + one row per finalist: culled ads never ship
});

test("an unknown campaign is a 404, not an empty CSV a brand could upload by mistake", async () => {
  const res = await campaignsRoutes.request("/campaigns/no-such-campaign/meta.csv");
  assert.equal(res.status, 404);
});

test("iterate refuses an unknown campaign or ad with a 404, so a stale page never breeds the wrong ad", async () => {
  assert.equal((await campaignsRoutes.request("/campaigns/no-such-campaign/ads/x/iterate", { method: "POST" })).status, 404);
  assert.equal((await campaignsRoutes.request(`/campaigns/${fixture.id}/ads/no-such-ad/iterate`, { method: "POST" })).status, 404);
});

test("iterate before gen 0 is done is a 409: there is no screened ad to breed from yet", async () => {
  const id = "iterate-early";
  writeFileSync(join(dir, "campaigns", `${id}.json`), JSON.stringify({ ...fixture, id, stage: "screening", generations: [], winnerId: null }));
  const res = await campaignsRoutes.request(`/campaigns/${id}/ads/${fixture.generations[0].ads[0].id}/iterate`, { method: "POST" });
  assert.equal(res.status, 409);
});
