import { z } from "zod";

/**
 * The one door to OpenAI. Plain fetch, no SDK, so the shared lockfile never changes.
 * Every response is parsed with zod at this boundary: a malformed answer retries once,
 * then throws with the raw text so the failure is visible, never swallowed.
 */
export const MODELS = {
  copy: process.env.OPENAI_MODEL_COPY ?? "gpt-6.1-sol",
  panel: process.env.OPENAI_MODEL_PANEL ?? "gpt-5.4-mini",
  image: process.env.OPENAI_MODEL_IMAGE ?? "gpt-image-2",
};

/** Running token totals for this process; scripts print them so the README can report real usage. */
export const usageTotals = { calls: 0, promptTokens: 0, completionTokens: 0 };

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

type ChatBody = {
  choices: { message: { content: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing: run `set -a; . ./.env; set +a` from the repo root first");
  return key;
}

/**
 * POST to OpenAI. Retries network failures (the venue's flaky DNS: ENOTFOUND, EAI_AGAIN,
 * resets) with backoff; HTTP errors are returned for the caller to judge. JSON or FormData body.
 */
export async function openaiFetch(path: string, body: unknown): Promise<Response> {
  const isForm = body instanceof FormData;
  const key = apiKey(); // a missing key fails at once, not after 4 "network" retries
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(`https://api.openai.com${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, ...(isForm ? {} : { "content-type": "application/json" }) },
        body: isForm ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      });
    } catch (err) {
      if (attempt >= 4) throw new Error(`OpenAI ${path} unreachable after ${attempt} tries: ${String((err as Error).cause ?? err)}`);
      await sleep(2000 * attempt);
    }
  }
}

export async function chatJson<T>(opts: {
  model: string;
  system: string;
  user: string | ContentPart[];
  /** Name and strict JSON schema sent to the API; `schema` re-checks the reply with zod. */
  name: string;
  jsonSchema: Record<string, unknown>;
  schema: z.ZodType<T>;
}): Promise<T> {
  // Separate budgets: up to 2 retries for rate limits/5xx, and 1 retry for a malformed reply.
  let httpRetries = 0;
  let parseRetries = 0;
  for (;;) {
    const res = await openaiFetch("/v1/chat/completions", {
      model: opts.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: { type: "json_schema", json_schema: { name: opts.name, strict: true, schema: opts.jsonSchema } },
    });
    const raw = await res.text();
    if ((res.status === 429 || res.status >= 500) && httpRetries < 2) {
      httpRetries++;
      await sleep(1500 * httpRetries);
      continue;
    }
    if (!res.ok) throw new Error(`OpenAI ${opts.model} HTTP ${res.status}: ${raw.slice(0, 500)}`);

    const body = JSON.parse(raw) as ChatBody;
    usageTotals.calls++;
    usageTotals.promptTokens += body.usage?.prompt_tokens ?? 0;
    usageTotals.completionTokens += body.usage?.completion_tokens ?? 0;

    const text = body.choices[0]?.message.content ?? "";
    try {
      return opts.schema.parse(JSON.parse(text));
    } catch (err) {
      if (parseRetries >= 1) throw new Error(`OpenAI ${opts.model} returned an invalid ${opts.name}: ${String(err)}\n${text.slice(0, 1000)}`);
      parseRetries++;
    }
  }
}

/** Run async jobs with a concurrency cap; results keep input order. */
export async function mapLimit<I, O>(items: I[], limit: number, fn: (item: I, index: number) => Promise<O>): Promise<O[]> {
  const out = new Array<O>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
