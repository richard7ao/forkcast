import assert from "node:assert/strict";
import { test } from "node:test";
import { Product } from "@hack/contract";
import { mergeReadings, Reading as ReadingSchema, READING_JSON_SCHEMA, slugify, type Reading } from "./shelf";

const reading = (over: Partial<Reading> = {}): Reading => ({
  brand: "OOM",
  name: "Balance",
  price: "",
  facts: [],
  view: "front",
  confidence: "high",
  notes: "",
  ...over,
});

test("the strict JSON schema lists exactly the fields zod parses, so a field added to one cannot be silently dropped by the other", () => {
  assert.deepEqual([...READING_JSON_SCHEMA.required].sort(), Object.keys(ReadingSchema.shape).sort());
  assert.deepEqual(Object.keys(READING_JSON_SCHEMA.properties).sort(), Object.keys(ReadingSchema.shape).sort());
});

test("slugs ignore case, punctuation and accents so one pack always maps to one file", () => {
  assert.equal(slugify("OOM", "Balance"), "oom-balance");
  assert.equal(slugify("  oom ", "BALANCE!"), "oom-balance");
  assert.equal(slugify("Crème Fraîche Co.", "Café Latte"), "creme-fraiche-co-cafe-latte");
});

test("slugs are URL-safe even for messy labels and cannot climb out of data/shelf, since they become file names", () => {
  for (const [brand, name] of [
    ["Ben & Jerry's", "Phish Food® 465ml"],
    ["¡Olé!", "100% oat / vegan"],
    ["a..b", "../../etc/passwd"],
  ] as const) {
    const slug = slugify(brand, name);
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${brand} + ${name} -> ${slug}`);
  }
  assert.equal(slugify("x", "../../etc/passwd"), "x-etc-passwd");
});

test("a name that repeats the brand slugs like the bare name, so label splits do not fork one product", () => {
  assert.equal(slugify("OOM", "OOM Balance"), slugify("OOM", "Balance"));
  assert.equal(slugify("OOM", "OOM"), "oom");
});

test("nothing readable gives an empty slug so callers can refuse it", () => {
  assert.equal(slugify("", ""), "");
  assert.equal(slugify("  ", "!!!"), "");
});

test("two photos of one pack merge into one candidate without duplicated facts", () => {
  const { candidates } = mergeReadings([
    { source: "front.jpeg", reading: reading({ facts: ["Vegan", "No added sugar", "250ml"] }) },
    { source: "back.jpeg", reading: reading({ view: "back", confidence: "medium", facts: ["vegan.", "Contains oats", "No Added Sugar"] }) },
  ]);
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0]!.product.facts, ["Vegan", "No added sugar", "250ml", "Contains oats"]);
  assert.equal(candidates[0]!.entry.factCount, 4);
});

test("the clearest photo supplies the name and heads sourceImages, so sourceImages[0] is the best hero source", () => {
  const { candidates } = mergeReadings([
    { source: "blurry.jpeg", reading: reading({ name: "balance", confidence: "low", facts: ["Vegan"] }) },
    { source: "clear.jpeg", reading: reading({ name: "Balance", confidence: "high", facts: ["Vegan", "250ml"] }) },
    { source: "ok.jpeg", reading: reading({ confidence: "medium" }) },
  ]);
  const [c] = candidates;
  assert.deepEqual(c!.entry.sourceImages, ["clear.jpeg", "ok.jpeg", "blurry.jpeg"]);
  assert.equal(c!.entry.confidence, "high");
  assert.equal(c!.product.name, "Balance");
});

test("a front photo heads sourceImages and supplies the name even when the back label reads more clearly, since a back label is not an ad", () => {
  const { candidates } = mergeReadings([
    { source: "back.jpeg", reading: reading({ view: "back", confidence: "high", facts: ["Ingredients: water", "12kcal per 100ml", "250ml"] }) },
    { source: "front.jpeg", reading: reading({ view: "front", confidence: "medium", name: "Balance", facts: ["Chaga"] }) },
  ]);
  const [c] = candidates;
  assert.deepEqual(c!.entry.sourceImages, ["front.jpeg", "back.jpeg"]);
  assert.deepEqual(c!.product.facts, ["Chaga", "Ingredients: water", "12kcal per 100ml", "250ml"]);
  assert.equal(c!.product.name, "Balance");
});

test("a price seen on any photo survives the merge, preferring the clearest photo's", () => {
  const { candidates } = mergeReadings([
    { source: "a.jpeg", reading: reading({ price: "" }) },
    { source: "b.jpeg", reading: reading({ confidence: "medium", price: "£1.80" }) },
    { source: "c.jpeg", reading: reading({ confidence: "low", price: "£1.90" }) },
  ]);
  assert.equal(candidates[0]!.product.price, "£1.80");
});

test("different packs stay separate and the best-read come first, so the shortlist leads with usable facts", () => {
  const { candidates } = mergeReadings([
    { source: "1.jpeg", reading: reading({ brand: "Flow", name: "Latte", confidence: "low", facts: ["Vegan"] }) },
    { source: "2.jpeg", reading: reading({ facts: ["a", "b"] }) },
    { source: "3.jpeg", reading: reading({ brand: "Nakd", name: "Cashew Cookie", facts: ["a", "b", "c"] }) },
  ]);
  assert.deepEqual(
    candidates.map((c) => c.entry.slug),
    ["nakd-cashew-cookie", "oom-balance", "flow-latte"],
  );
});

test("a photo with no readable brand or name is reported, never merged into a made-up product", () => {
  const floor = { source: "floor.jpeg", reading: reading({ brand: "", name: "", confidence: "low" }) };
  const { candidates, unidentified } = mergeReadings([floor]);
  assert.deepEqual(candidates, []);
  assert.deepEqual(unidentified, [floor]);
});

test("back labels that only show a brand are not merged, since two products of one brand would swap ingredients", () => {
  const gingerBack = { source: "ginger-back.jpeg", reading: reading({ brand: "NAVAS", name: "", confidence: "low", facts: ["natural flavourings (ginger, lime)"] }) };
  const tonicBack = { source: "tonic-back.jpeg", reading: reading({ brand: "NAVAS", name: "", confidence: "low", facts: ["quinine"] }) };
  const front = { source: "front.jpeg", reading: reading({ brand: "NAVAS", name: "Fiery Ginger Beer", facts: ["200ml"] }) };
  const { candidates, unidentified } = mergeReadings([gingerBack, front, tonicBack]);
  assert.deepEqual(candidates.map((c) => c.product.facts), [["200ml"]]);
  assert.deepEqual(unidentified, [gingerBack, tonicBack]);
});

test("a name with no brand is unidentified too, since the same name can exist under two brands", () => {
  const nameOnly = { source: "a.jpeg", reading: reading({ brand: "", name: "Balance" }) };
  assert.deepEqual(mergeReadings([nameOnly]).unidentified, [nameOnly]);
});

test("candidate products satisfy the frozen contract, since data/shelf/<slug>.json feeds product.json", () => {
  const { candidates } = mergeReadings([{ source: "a.jpeg", reading: reading({ facts: ["Vegan"] }) }]);
  const product = candidates[0]!.product;
  assert.deepEqual(Product.parse(product), product);
  assert.equal(product.imageUrl, "/product.jpg");
});

test("merging never mutates the readings it is given, so a re-merge sees the same input", () => {
  const items = [
    { source: "a.jpeg", reading: reading({ confidence: "low", facts: ["Vegan"] }) },
    { source: "b.jpeg", reading: reading({ facts: ["Vegan", "250ml"] }) },
  ];
  const before = structuredClone(items);
  mergeReadings(items);
  assert.deepEqual(items, before);
});
