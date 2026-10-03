import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Serves campaign images written after the server started. `next start` serves only the public/ files
 * that existed at startup, so a live upload's renders would 404 until a restart. Files present at
 * startup are still served from public/ directly; this handler only sees the newer ones.
 */
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await ctx.params;
  const ext = /^[\w-]+\.(png|jpe?g|webp)$/.exec(file)?.[1];
  // Both segments are allow-listed (no dots but the extension, no slashes): nothing outside generated/campaigns.
  if (!/^[a-z0-9-]{1,40}$/.test(id) || !ext) return new Response("not found", { status: 404 });
  try {
    const bytes = await readFile(join(process.cwd(), "public", "generated", "campaigns", id, file));
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": TYPES[ext]!, "cache-control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
