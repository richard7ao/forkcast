import { z } from "zod";
import type { Product } from "@hack/contract";

/**
 * Pure helpers behind scripts/extract-facts.ts: one vision reading per photo, merged into
 * one contract Product per physical pack. No I/O here, so the merge rules are unit-tested.
 */
export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

export const View = z.enum(["front", "back", "side", "other"]);
export type View = z.infer<typeof View>;

/** What the vision model read off ONE photo of ONE pack. */
export const Reading = z.object({
  brand: z.string(),
  name: z.string(),
  price: z.string(),           // "" when no price is visible
  facts: z.array(z.string()),  // claims printed on the pack, near-verbatim
  view: View,                  // which side of the pack the photo shows; a hero must be rendered from a front view
  confidence: Confidence,
  notes: z.string(),
});
export type Reading = z.infer<typeof Reading>;

/** Strict JSON schema sent to the API; must list exactly the fields of `Reading` (a test pins that). */
export const READING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["brand", "name", "price", "facts", "view", "confidence", "notes"],
  properties: {
    brand: { type: "string" },
    name: { type: "string" },
    price: { type: "string" },
    facts: { type: "array", items: { type: "string" } },
    view: { type: "string", enum: View.options },
    confidence: { type: "string", enum: Confidence.options },
    notes: { type: "string" },
  },
};

export const READING_SYSTEM = `You read food and drink packaging from a hand-held photo for an ad pre-testing tool. Ad copy may only use claims that are really printed on the pack, so accuracy matters more than anything else.

Rules:
- Report only text you can actually read in this photo. Never guess, infer or complete text: a line that is cut off, curved out of view, blurred or hidden by a hand is not a fact, and a number you cannot read with certainty is left out, never estimated. An empty list beats an invented fact.
- brand: the brand as printed anywhere on the pack, including a producer line, website or social handle ("Produced for OOM Drinks Ltd" gives "OOM"). "" if there is none.
- name: the product's own name as printed in its title, without the brand ("OOM Balance" gives "Balance"). If the pack names a flavour or variant of a range as a short name ("Lemon & Raspberry", "Salted Caramel", "Hazy Pale"), keep it in the name, because each flavour is a different product. A tagline or sentence-like description beneath the title ("Lightly sparkling peach, blood orange & hops") is a fact, not part of the name. "" if you cannot read a name.
- price: only a price visibly printed on a label or tag in the photo, as shown, e.g. "£1.80". Otherwise "".
- facts: every legible claim, one per entry, near-verbatim: taglines and flavour descriptions, health and nutrition claims word for word, the whole ingredient list as one entry, each nutrition line with its numbers and units, vitamin amounts, allergen statements, usage instructions, origin, certifications ("Vegan", "Fairtrade"), pack size. Leave out the brand and product name on their own, barcodes, contact details, and text on any other object in the frame.
- If several products are in frame, read only the one held or most central.
- view: "front" when the photo mainly shows the pack's main label with the brand and product name; "back" when it mainly shows the ingredients and nutrition panel; "side" for a narrow side or curved edge; "other" if none fits.
- confidence: "high" when the brand, name and claims are clearly legible; "medium" when parts are blurred, glared or cut off; "low" when you could not reliably read the brand or name.
- notes: one short sentence on what limited your reading (glare, blur, cut-off text, hand, other products), or "" if nothing did.`;

/** One row of data/shelf/index.json. sourceImages are ordered best hero source first: front views, then clearest. */
export const ShelfIndexEntry = z.object({
  slug: z.string(),
  brand: z.string(),
  name: z.string(),
  factCount: z.number().int().min(0),
  confidence: Confidence,
  sourceImages: z.array(z.string()),
});
export type ShelfIndexEntry = z.infer<typeof ShelfIndexEntry>;

export type SourcedReading = { source: string; reading: Reading };
/** `product` is written to data/shelf/<slug>.json, `entry` to index.json. */
export type Candidate = { entry: ShelfIndexEntry; product: Product };

const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

const words = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Stable, URL-safe id for a pack: ("OOM", "Balance") -> "oom-balance". A name that repeats the
 * brand ("OOM Balance") slugs the same as the bare name, so photos that split the label
 * differently still land on one file. "" means nothing readable to build an id from.
 */
export function slugify(brand: string, name: string): string {
  const b = words(brand);
  const n = words(name);
  const bare = b && (n === b || n.startsWith(`${b} `)) ? n.slice(b.length).trim() : n;
  return [b, bare].filter(Boolean).join(" ").replace(/ /g, "-");
}

/** Case, spacing and punctuation must not make the same claim look different. */
const factKey = (fact: string) => fact.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function mergeGroup(slug: string, group: SourcedReading[]): Candidate {
  // Front views first, then clearest: the front label's brand, name and price win, its claims lead the
  // facts, and its file is sourceImages[0], the photo to render the hero from (a back label is not an ad).
  const front = ({ reading }: SourcedReading) => (reading.view === "front" ? 1 : 0);
  const ranked = [...group].sort(
    (a, b) =>
      front(b) - front(a) ||
      RANK[b.reading.confidence] - RANK[a.reading.confidence] ||
      b.reading.facts.length - a.reading.facts.length,
  );
  const best = ranked[0]!.reading;

  const unique = new Map<string, string>();
  for (const { reading } of ranked) {
    for (const fact of reading.facts) {
      const key = factKey(fact);
      if (key && !unique.has(key)) unique.set(key, fact.trim());
    }
  }
  const facts = [...unique.values()];

  const product: Product = {
    brand: best.brand.trim(),
    name: best.name.trim(),
    price: ranked.map((r) => r.reading.price.trim()).find(Boolean) ?? "",
    imageUrl: "/product.jpg",
    facts,
  };
  const entry: ShelfIndexEntry = {
    slug,
    brand: product.brand,
    name: product.name,
    factCount: facts.length,
    confidence: best.confidence,
    sourceImages: ranked.map((r) => r.source),
  };
  return { entry, product };
}

/** A brand alone ("NAVAS") fits several products, so only a reading with both a brand and a name says which pack it is. */
const identifiesProduct = ({ brand, name }: Reading) => words(brand) !== "" && words(name) !== "";

/**
 * Group readings by slug and merge each group into one Candidate (best confidence, then most
 * facts, first). Readings without a readable brand AND name come back as `unidentified`: guessing
 * which product a nameless back label belongs to would put another product's facts on this one.
 */
export function mergeReadings(items: SourcedReading[]): { candidates: Candidate[]; unidentified: SourcedReading[] } {
  const bySlug = new Map<string, SourcedReading[]>();
  const unidentified: SourcedReading[] = [];
  for (const item of items) {
    if (!identifiesProduct(item.reading)) {
      unidentified.push(item);
      continue;
    }
    const slug = slugify(item.reading.brand, item.reading.name);
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), item]);
  }
  const candidates = [...bySlug]
    .map(([slug, group]) => mergeGroup(slug, group))
    .sort(
      (a, b) =>
        RANK[b.entry.confidence] - RANK[a.entry.confidence] ||
        b.entry.factCount - a.entry.factCount ||
        a.entry.slug.localeCompare(b.entry.slug),
    );
  return { candidates, unidentified };
}
