import { Hono } from "hono";
import type { z } from "zod";
import { ChallengerRequest, CreateCampaignRequest, type ResponseOf } from "@hack/contract";
import { createCampaign, evolveCampaign, loadCampaign } from "../lib/campaigns";
import { adminTokenConfigured } from "../lib/challenger";
import { toMetaCsv } from "../lib/metaExport";

const issues = (error: z.ZodError) => error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
const body = (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => null);

/** POST /campaigns starts a job and answers at once; poll GET /campaigns/:id. Evolve is admin only, as the challenger. */
export const campaignsRoutes = new Hono()
  .post("/campaigns", async (c) => {
    const parsed = CreateCampaignRequest.safeParse(await body(c));
    if (!parsed.success) return c.json({ ok: false, error: issues(parsed.error) } satisfies ResponseOf<"createCampaign">, 400);
    const started = createCampaign(parsed.data);
    if ("error" in started) return c.json({ ok: false, error: started.error } satisfies ResponseOf<"createCampaign">, started.status);
    return c.json({ ok: true, campaignId: started.id } satisfies ResponseOf<"createCampaign">);
  })
  .get("/campaigns/:id", (c) => {
    const campaign = loadCampaign(c.req.param("id"));
    if (!campaign) return c.json({ error: "no such campaign" }, 404);
    return c.json({ campaign } satisfies ResponseOf<"campaign">);
  })
  // Not in the contract: CSV fits no JSON fixture. Link to /api/campaigns/:id/meta.csv (live mode only).
  .get("/campaigns/:id/meta.csv", (c) => {
    const id = c.req.param("id");
    const campaign = loadCampaign(id); // null unless id matches /^[a-z0-9-]{1,40}$/, so it is safe in the header below
    if (!campaign) return c.json({ error: "no such campaign" }, 404);
    const last = campaign.generations.at(-1);
    if (!last) return c.json({ error: `campaign is ${campaign.stage}: no generation to export yet` }, 409);
    // The last generation only: survivors are carried into the next one, so earlier generations would repeat them.
    const csv = toMetaCsv(campaign.name, last.ads, process.env.PUBLIC_URL ?? "http://localhost:3300");
    return c.body(csv, 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="forkcast-${id}-meta.csv"`,
    });
  })
  .post("/campaigns/:id/evolve", async (c) => {
    const rejected = (error: string): ResponseOf<"evolveCampaign"> => ({ ok: false, error });
    const token = process.env.ADMIN_TOKEN;
    if (!adminTokenConfigured(token)) return c.json(rejected("admin token not configured"), 401);
    const parsed = ChallengerRequest.safeParse(await body(c));
    if (!parsed.success) return c.json(rejected(issues(parsed.error)), 400);
    if (parsed.data.adminToken !== token) return c.json(rejected("unauthorized"), 401);
    const started = evolveCampaign(c.req.param("id"));
    if ("error" in started) return c.json(rejected(started.error), started.status);
    return c.json({ ok: true, campaign: started.campaign } satisfies ResponseOf<"evolveCampaign">);
  });
