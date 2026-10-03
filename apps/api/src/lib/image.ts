import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";
import { z } from "zod";
import type { GeneratedFile } from "../data/files";
import { MODELS, openaiFetch } from "./llm";

const run = promisify(execFile);

/** Fixed brief: every variant of a round shows this one visual, so only the copy differs. */
export const HERO_PROMPT =
  "Professional square social media ad photo of this exact product. Keep the packaging, logo, colours and label text exactly as in the photo; do not invent, add or alter any text. Remove hands, people, floor and background clutter; place the product on a clean, appetising styled background with soft natural light. No text overlays.";

export const IMAGE_QUALITIES = ["low", "medium", "high", "auto"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];
export const DEFAULT_QUALITY: ImageQuality = "medium";

const EditResponse = z.object({
  data: z.array(z.object({ b64_json: z.string().min(1) })).min(1),
  usage: z.object({ input_tokens: z.number().optional(), output_tokens: z.number().optional(), total_tokens: z.number().optional() }).optional(),
});
export type ImageUsage = NonNullable<z.infer<typeof EditResponse>["usage"]>;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Re-encode a photo as a JPEG no larger than maxPx, with macOS sips (the venue laptops are Macs).
 * execFile, not a shell: WhatsApp export names carry spaces and parentheses. sips also enlarges
 * photos smaller than maxPx, which is harmless here.
 */
export async function downscale(file: string, maxPx: number): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "forkcast-"));
  try {
    const out = join(dir, "photo.jpg");
    await run("sips", ["-s", "format", "jpeg", "-Z", String(maxPx), file, "--out", out]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * gpt-image edit: one product photo in, one 1024x1024 PNG out. Probed against gpt-image-2: it accepts
 * model, prompt, size, quality and image, and rejects `input_fidelity` (HTTP 400). The reply is always
 * base64. 429 and 5xx retry (the call is slow and paid); anything else throws with the API's message.
 * Quality defaults to DEFAULT_QUALITY (medium): measured on one can, label text was as faithful as high in ~35 s instead of ~98 s,
 * and openaiFetch gives up on a request after 180 s.
 */
export async function editProductImage(opts: {
  photo: Buffer;
  quality?: ImageQuality;
  prompt?: string;
}): Promise<{ png: Buffer; usage: ImageUsage | null }> {
  const form = new FormData();
  form.append("model", MODELS.image);
  form.append("prompt", opts.prompt ?? HERO_PROMPT);
  form.append("size", "1024x1024");
  form.append("quality", opts.quality ?? DEFAULT_QUALITY);
  form.append("image", new Blob([new Uint8Array(opts.photo)], { type: "image/jpeg" }), "product.jpg");

  for (let attempt = 1; ; attempt++) {
    const res = await openaiFetch("/v1/images/edits", form);
    const raw = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(1500 * attempt);
      continue;
    }
    if (!res.ok) throw new Error(`OpenAI ${MODELS.image} images/edits HTTP ${res.status}: ${raw.slice(0, 500)}`);

    let body: z.infer<typeof EditResponse>;
    try {
      body = EditResponse.parse(JSON.parse(raw));
    } catch (err) {
      throw new Error(`OpenAI ${MODELS.image} images/edits returned an unexpected body: ${String(err)}\n${raw.slice(0, 300)}`);
    }
    const png = Buffer.from(body.data[0]!.b64_json, "base64");
    if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new Error(`OpenAI ${MODELS.image} images/edits returned data that is not a PNG`);
    return { png, usage: body.usage ?? null };
  }
}

/** A new GeneratedFile with `round`'s hero set to `url`; every other round's hero is kept. */
export function withHero(generated: GeneratedFile, round: number, url: string): GeneratedFile {
  return { heroByRound: { ...generated.heroByRound, [String(round)]: url } };
}
