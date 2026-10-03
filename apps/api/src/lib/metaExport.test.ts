import assert from "node:assert/strict";
import { test } from "node:test";
import { type ExportAd, toMetaCsv } from "./metaExport";

const SITE = "https://forkcast.example";
const ad = (over: Partial<ExportAd> = {}): ExportAd => ({
  id: "g1-scarcity-0",
  headline: "Giant mallows",
  body: "Made for toasting.",
  cta: "Shop now",
  imageUrl: "/generated/g1-scarcity-0.png",
  lever: "scarcity",
  status: "survivor",
  ...over,
});

/** Minimal RFC 4180 reader (quoted cells, doubled quotes, CRLF rows): if it gets the same cells back, a spreadsheet will too. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && text[i + 1] === "\n") {
      rows.push([...row, cell]);
      row = [];
      cell = "";
      i++;
    } else {
      cell += ch;
    }
  }
  rows.push([...row, cell]);
  return rows;
}

/** Data rows keyed by header name. */
function table(csv: string): Record<string, string>[] {
  const [head = [], ...rows] = parseCsv(csv);
  return rows.map((row) => Object.fromEntries(head.map((name, i) => [name, row[i] ?? ""])));
}

const column = (name: string, over: Partial<ExportAd>, site = SITE) => table(toMetaCsv("C", [ad(over)], site))[0]?.[name];

test("each row carries the core Meta columns, so the file maps onto Ads Manager's import without renaming", () => {
  const csv = toMetaCsv("EPIC Snax", [ad()], SITE);
  assert.deepEqual(parseCsv(csv)[0], ["Campaign Name", "Ad Set Name", "Ad Name", "Title", "Body", "Call to Action", "Image URL", "Link"]);
  assert.deepEqual(table(csv), [
    {
      "Campaign Name": "EPIC Snax",
      "Ad Set Name": "Forkcast survivors",
      "Ad Name": "g1-scarcity-0 scarcity",
      Title: "Giant mallows",
      Body: "Made for toasting.",
      "Call to Action": "SHOP_NOW",
      "Image URL": "https://forkcast.example/generated/g1-scarcity-0.png",
      Link: SITE,
    },
  ]);
});

test("commas, quotes and newlines in the copy stay inside their own cell, so one headline cannot shift every column after it", () => {
  const messy = ad({ headline: 'Giant, "pillowy" hunks', body: "Line one\nLine two, with a comma" });
  const csv = toMetaCsv("EPIC, \"Snax\"", [messy], SITE);
  const [row] = table(csv);
  assert.equal(parseCsv(csv)[1]?.length, 8);
  assert.equal(row?.["Campaign Name"], 'EPIC, "Snax"');
  assert.equal(row?.["Title"], messy.headline);
  assert.equal(row?.["Body"], messy.body);
  assert.equal(row?.["Link"], SITE);
});

test("culled and still-screening ads are never exported: only survivors and the winner can reach Meta", () => {
  const ads = [
    ad({ id: "w", status: "winner" }),
    ad({ id: "s", status: "survivor" }),
    ad({ id: "c", status: "culled" }),
    ad({ id: "x", status: "screening" }),
  ];
  assert.deepEqual(table(toMetaCsv("C", ads, SITE)).map((r) => r["Ad Name"]), ["w scarcity", "s scarcity"]);
  assert.deepEqual(table(toMetaCsv("C", [ad({ status: "culled" })], SITE)), []);
});

test("free-text CTAs map to the nearest standard Meta button and anything unrecognised falls back to SHOP_NOW", () => {
  const cta = (text: string) => column("Call to Action", { cta: text });
  assert.equal(cta("Order yours"), "ORDER_NOW");
  assert.equal(cta("Claim the offer"), "GET_OFFER");
  assert.equal(cta("See the recipe"), "LEARN_MORE");
  assert.equal(cta("Check the facts"), "LEARN_MORE");
  for (const standard of ["ORDER_NOW", "GET_OFFER", "LEARN_MORE", "SHOP_NOW"]) assert.equal(cta(standard), standard);
  // "ideal" contains "deal": only whole words may match, or an unrelated CTA turns into an offer button
  for (const text of ["Shop now", "Grab a bag now", "Toast your treat", "Ideal for s'mores", ""]) assert.equal(cta(text), "SHOP_NOW", text);
});

test("image URLs resolve against the site, so a trailing slash or an absolute URL never produces a broken link", () => {
  const image = (imageUrl: string | undefined, site = SITE) => column("Image URL", { imageUrl }, site);
  assert.equal(image("/generated/a.png"), "https://forkcast.example/generated/a.png");
  assert.equal(image("/generated/a.png", "https://forkcast.example/"), "https://forkcast.example/generated/a.png");
  assert.equal(image("https://cdn.example/a.png"), "https://cdn.example/a.png");
  assert.equal(image(undefined), "");
  assert.equal(column("Link", {}, "https://forkcast.example/"), "https://forkcast.example/");
});

test("copy a spreadsheet would run as a formula is defused, so opening the export in Excel cannot execute it", () => {
  const evil = ad({ headline: '=HYPERLINK("http://evil.example","Click")', body: "@SUM(1+1)" });
  const [row] = table(toMetaCsv("C", [evil], SITE));
  assert.equal(row?.["Title"], `'${evil.headline}`);
  assert.equal(row?.["Body"], `'${evil.body}`);
});

test("a malformed site URL throws instead of writing a CSV of broken links", () => {
  assert.throws(() => toMetaCsv("C", [ad()], "forkcast.example"), /Invalid URL/);
});
