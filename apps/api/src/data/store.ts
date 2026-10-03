import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import { Product, VariantsResponse, type Variant, type VoteRequest } from "@hack/contract";
import { dataDir, ForecastFile, GeneratedFile, StateFile, VariantsFile, VoteLine } from "./files";

/** cwd is apps/api, as with dataDir(). */
const FIXTURES_DIR = join(process.cwd(), "../../fixtures");

/** Parse with the file's schema; a corrupt file throws naming where it came from. */
function parse<T extends z.ZodTypeAny>(schema: T, text: string, where: string): z.infer<T> {
  try {
    return schema.parse(JSON.parse(text));
  } catch (err) {
    throw new Error(`${where}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function readJson<T extends z.ZodTypeAny>(path: string, schema: T): z.infer<T> | null {
  return existsSync(path) ? parse(schema, readFileSync(path, "utf8"), path) : null;
}

function readVoteLines(path: string): VoteLine[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .flatMap((line, i) => (line.trim() ? [parse(VoteLine, line, `${path}:${i + 1}`)] : []));
}

/** The fixture variants file, which lets live mode serve round 1 before generate.ts has run. */
function fixture() {
  const path = join(FIXTURES_DIR, "variants.json");
  const parsed = readJson(path, VariantsResponse);
  if (!parsed) throw new Error(`${path}: missing, and the data dir has no product/round-1 variants to use instead`);
  return parsed;
}

const voteKey = (v: Pick<VoteRequest, "voterId" | "variantId">) => `${v.voterId}|${v.variantId}`;

/**
 * JSON files are read fresh on every call (they are tiny, and the AI scripts rewrite them while
 * the server runs). Votes are loaded once, then appended to memory and votes.jsonl together.
 */
export function openStore(dir = dataDir()) {
  const votesPath = join(dir, "votes.jsonl");
  const seen = new Set<string>();
  let votes: readonly VoteLine[] = readVoteLines(votesPath).filter((v) => {
    if (seen.has(voteKey(v))) return false;
    seen.add(voteKey(v));
    return true;
  });
  let warned = false;
  const fixtureProduct = () => {
    if (!warned) console.warn(`${join(dir, "product.json")} missing: serving the fixture product`);
    warned = true;
    return fixture().product;
  };

  const state = (): StateFile => readJson(join(dir, "state.json"), StateFile) ?? { activeRound: 1 };

  return {
    state,

    activeRound(): number {
      return state().activeRound;
    },

    /** product.json, with that round's generated hero image (if any) as imageUrl. */
    product(round: number): Product {
      const product = readJson(join(dir, "product.json"), Product) ?? fixtureProduct();
      const hero = readJson(join(dir, "generated.json"), GeneratedFile)?.heroByRound[String(round)];
      return hero ? { ...product, imageUrl: hero } : product;
    },

    /** Null when the round has no variants yet; round 1 falls back to the fixture variants. */
    variants(round: number): Variant[] | null {
      const file = readJson(join(dir, "variants", `round-${round}.json`), VariantsFile);
      if (file) return file.variants;
      return round === 1 ? fixture().variants : null;
    },

    forecast(round: number): ForecastFile | null {
      return readJson(join(dir, "forecasts", `round-${round}.json`), ForecastFile);
    },

    /** Deduplicated on (voterId, variantId), oldest first. The array is never mutated after it is returned. */
    votes(): readonly VoteLine[] {
      return votes;
    },

    /** A repeat (voterId, variantId) is reported as a duplicate and not written. */
    addVote(vote: VoteRequest): { duplicate: boolean } {
      if (seen.has(voteKey(vote))) return { duplicate: true };
      const line: VoteLine = { ...vote, at: new Date().toISOString() };
      mkdirSync(dir, { recursive: true });
      appendFileSync(votesPath, `${JSON.stringify(line)}\n`);
      // Memory only changes once the line is on disk, so a failed write can be retried.
      seen.add(voteKey(vote));
      votes = [...votes, line];
      return { duplicate: false };
    },
  };
}

export type Store = ReturnType<typeof openStore>;

export const store = openStore();
