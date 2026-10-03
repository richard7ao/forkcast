import { NextRequest, NextResponse } from "next/server";
import { endpoints, type EndpointName } from "@hack/contract";
import { resolveFixture } from "@hack/contract/fixtures";
import { join } from "node:path";

/**
 * The single seam between the two halves of the app.
 *
 * Components always fetch /api/<path>. This route decides where the bytes come
 * from: fixtures on disk, or the Hono server. Because the decision lives here
 * and not in component code, frontend lanes are never blocked on backend lanes,
 * and going live at integration time is an env var -- not a refactor.
 */
const FIXTURES = join(process.cwd(), "../../fixtures");

/** Match a concrete request against the contract's `:param` patterns. */
function match(method: string, segments: string[]) {
  for (const [name, ep] of Object.entries(endpoints) as [EndpointName, (typeof endpoints)[EndpointName]][]) {
    if (ep.method !== method) continue;
    const pattern = ep.path.replace(/^\//, "").split("/");
    if (pattern.length !== segments.length) continue;
    const params: Record<string, string> = {};
    const ok = pattern.every((p, i) => {
      const seg = segments[i]!;
      if (p.startsWith(":")) { params[p.slice(1)] = seg; return true; }
      return p === seg;
    });
    if (ok) return { name, params };
  }
  return null;
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const search = req.nextUrl.search;

  if ((process.env.DATA_MODE ?? "fixture") === "live") {
    const base = process.env.API_URL ?? "http://localhost:8787";
    const res = await fetch(`${base}/${path.join("/")}${search}`, {
      method: req.method,
      headers: { "content-type": "application/json" },
      body: req.method === "GET" ? undefined : await req.text(),
      cache: "no-store",
    });
    return new NextResponse(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  }

  const hit = match(req.method, path);
  if (!hit) return NextResponse.json({ error: `no contract endpoint for ${req.method} /${path.join("/")}` }, { status: 404 });
  try {
    return NextResponse.json(resolveFixture(hit.name, hit.params, FIXTURES));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
