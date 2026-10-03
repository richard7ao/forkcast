import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { challengerRoutes } from "./routes/challenger";
import { resultsRoutes } from "./routes/results";
import { variantsRoutes } from "./routes/variants";
import { votesRoutes } from "./routes/votes";

const app = new Hono();
app.use("*", cors());
app.get("/health", (c) => c.json({ ok: true }));

// Every route file is mounted once, here. Lanes edit their route file, never this one.
app.route("/", variantsRoutes);
app.route("/", votesRoutes);
app.route("/", resultsRoutes);
app.route("/", challengerRoutes);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`api  http://localhost:${port}`);
