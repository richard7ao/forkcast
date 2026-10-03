import { readFileSync } from "node:fs";
import { join } from "node:path";
import { endpoints, type EndpointName } from "./endpoints";

/**
 * Turns a fixture file into the exact body an endpoint promises.
 *
 * Conventions, so no per-endpoint glue code is ever needed:
 *   fixtures/<fixture>.json holds the LIST response verbatim
 *   its collection lives under the key <fixture>           (items.json -> .items)
 *   a detail endpoint returns { <singular>: element }      (items -> item)
 *   a POST endpoint returns  { ok: true, <singular>: element }
 *
 * Keeping this dumb and conventional is deliberate: fixture mode must never
 * become a second implementation that can disagree with the real API.
 */
export function resolveFixture(name: EndpointName, params: Record<string, string>, dir: string): unknown {
  const ep = endpoints[name];
  const raw = JSON.parse(readFileSync(join(dir, `${ep.fixture}.json`), "utf8")) as Record<string, unknown>;

  if (!("pickBy" in ep)) return raw;

  const collection = raw[ep.fixture];
  if (!Array.isArray(collection)) throw new Error(`fixtures/${ep.fixture}.json has no array under "${ep.fixture}"`);

  const key = (ep as { pickBy: string }).pickBy;
  const wanted = params[key];
  const found = collection.find((el) => (el as Record<string, unknown>)[key] === wanted);
  if (!found) throw new Error(`fixtures/${ep.fixture}.json has no element with ${key}=${wanted}`);

  const singular = ep.fixture.replace(/s$/, "");
  return ep.method === "GET" ? { [singular]: found } : { ok: true, [singular]: found };
}
