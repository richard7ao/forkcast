import { Hono } from "hono";

// Stub until backend stage T1.2.1. Already mounted in index.ts, so lanes edit this file only.
export const votesRoutes = new Hono().post("/votes", (c) => c.json({ error: "not implemented" }, 501));
