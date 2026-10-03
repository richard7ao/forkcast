import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { GET } from "./route";

// The handler reads from process.cwd()/public, as `next start` runs in apps/web.
const root = mkdtempSync(join(tmpdir(), "forkcast-generated-"));
const dir = join(root, "public", "generated", "campaigns", "abc123");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "scene-0.png"), "png-bytes");
// Real targets, so a 404 below comes from the allow-list and not from a missing file.
writeFileSync(join(root, "public", "generated", "secret.png"), "secret");
writeFileSync(join(dir, "notes.txt"), "notes");
process.chdir(root);
after(() => rmSync(root, { recursive: true, force: true }));

const get = (id: string, file: string) => GET(new Request("http://localhost"), { params: Promise.resolve({ id, file }) });

test("a render written after the server started is served, with its image type", async () => {
  const res = await get("abc123", "scene-0.png");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.equal(await res.text(), "png-bytes");
});

test("nothing outside generated/campaigns can be read: traversal, odd ids and non-images are 404", async () => {
  const attempts: [string, string][] = [
    ["..", "secret.png"],
    ["abc123", "../../secret.png"],
    ["abc123", "..%2F..%2Fsecret.png"],
    ["ABC123", "scene-0.png"],
    ["abc123", "notes.txt"],
  ];
  for (const [id, file] of attempts) assert.equal((await get(id, file)).status, 404, `${id}/${file}`);
});

test("a missing render is a 404, not a crash", async () => {
  assert.equal((await get("abc123", "scene-9.png")).status, 404);
});
