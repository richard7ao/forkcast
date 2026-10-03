import { Hono } from "hono";

// Stub until backend stage T1.3.1. Already mounted in index.ts, so lanes edit this file only.
export const challengerRoutes = new Hono().post("/challenger", (c) => c.json({ error: "not implemented" }, 501));
