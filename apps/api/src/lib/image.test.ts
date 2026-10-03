import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { crc32, deflateSync } from "node:zlib";
import { downscale, editProductImage, withHero } from "./image";
import { MODELS } from "./llm";

process.env.OPENAI_API_KEY ??= "test-key"; // fetch is stubbed per test; this only satisfies apiKey()

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("pixels")]);
const okBody = (usage?: object) => JSON.stringify({ data: [{ b64_json: PNG.toString("base64") }], usage });

test("rendering round 2 keeps round 1's hero, so a challenger round cannot orphan the sealed round's visual", () => {
  const after = withHero({ heroByRound: { "1": "/generated/r1.png" } }, 2, "/generated/r2.png");
  assert.deepEqual(after.heroByRound, { "1": "/generated/r1.png", "2": "/generated/r2.png" });
});

test("re-rendering a round replaces only that round's hero", () => {
  const after = withHero({ heroByRound: { "1": "/generated/a.png", "2": "/generated/b.png" } }, 1, "/generated/c.png");
  assert.deepEqual(after.heroByRound, { "1": "/generated/c.png", "2": "/generated/b.png" });
});

test("withHero returns a new file and leaves the stored one untouched, since the store may hold a reference", () => {
  const stored = Object.freeze({ heroByRound: Object.freeze({ "1": "/generated/a.png" }) });
  const after = withHero(stored, 2, "/generated/b.png");
  assert.notEqual(after, stored);
  assert.deepEqual(stored.heroByRound, { "1": "/generated/a.png" });
});

test("the edit call uploads the photo with the configured model and a square size, and returns the decoded PNG", async (t) => {
  const calls: { url: string; form: FormData }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, form: init.body as FormData });
    return new Response(okBody({ total_tokens: 7 }), { status: 200 });
  });

  const { png, usage } = await editProductImage({ photo: Buffer.from("jpeg bytes"), quality: "low" });

  assert.deepEqual(png, PNG);
  assert.equal(usage?.total_tokens, 7);
  const { url, form } = calls[0]!;
  assert.equal(url, "https://api.openai.com/v1/images/edits");
  assert.equal(form.get("model"), MODELS.image);
  assert.equal(form.get("size"), "1024x1024");
  assert.equal(form.get("quality"), "low");
  const image = form.get("image") as File;
  assert.equal(image.type, "image/jpeg");
  assert.equal(await image.text(), "jpeg bytes");
});

test("quality defaults to medium, since high takes ~100 s against openaiFetch's 180 s limit and read the same on the label", async (t) => {
  const forms: FormData[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    forms.push(init.body as FormData);
    return new Response(okBody(), { status: 200 });
  });
  await editProductImage({ photo: Buffer.from("x") });
  assert.equal(forms[0]!.get("quality"), "medium");
});

test("an API rejection throws with the API's message, so a bad parameter is never mistaken for a render", async (t) => {
  const error = { message: "The model does not support the 'input_fidelity' parameter." };
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error }), { status: 400 }));
  await assert.rejects(editProductImage({ photo: Buffer.from("x") }), /HTTP 400.*input_fidelity/s);
});

test("a transient 503 is retried, so a flaky minute does not lose a paid render", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => (++calls === 1 ? new Response("busy", { status: 503 }) : new Response(okBody(), { status: 200 })));
  const { png } = await editProductImage({ photo: Buffer.from("x") });
  assert.deepEqual(png, PNG);
  assert.equal(calls, 2);
});

test("a reply that is not a PNG is refused, so a .png on disk is always a real PNG", async (t) => {
  const html = Buffer.from("<html>").toString("base64");
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ data: [{ b64_json: html }] }), { status: 200 }));
  await assert.rejects(editProductImage({ photo: Buffer.from("x") }), /not a PNG/);
});

/** A solid-grey RGB PNG, built by hand so the test needs no fixture image (sample_images must stay out of the repo). */
function solidPng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x80)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([PNG.subarray(0, 8), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test(
  "downscale fits a big photo within the limit as a JPEG, even when its path has spaces and parentheses",
  { skip: process.platform === "darwin" ? false : "needs macOS sips" },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "forkcast-test-"));
    try {
      const source = join(dir, "WhatsApp Image 12.46.42 (1).png");
      await writeFile(source, solidPng(3000, 1500));

      const jpeg = await downscale(source, 1024);

      assert.deepEqual([...jpeg.subarray(0, 3)], [0xff, 0xd8, 0xff]);
      const resized = join(dir, "resized.jpg");
      await writeFile(resized, jpeg);
      const { stdout } = await promisify(execFile)("sips", ["-g", "pixelWidth", "-g", "pixelHeight", resized]);
      const sides = [...stdout.matchAll(/pixel(?:Width|Height): (\d+)/g)].map((m) => Number(m[1]));
      assert.deepEqual(sides, [1024, 512]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
