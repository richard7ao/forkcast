import { z } from "zod";
import { ChallengerRequest, ChallengerResponse, ResultsResponse, VariantsResponse, VoteRequest, VoteResponse } from "./schemas";

/**
 * One registry, three consumers:
 *   apps/api    -- handlers are typed by `response`, so drift fails typecheck
 *   apps/web    -- fetchTyped() parses with the same `response`
 *   fixtures/   -- validate.ts parses fixtures/<fixture>.json with it too
 *
 * `request` (POST only) is the body schema; the API parses it at the boundary.
 * Frozen at 13:05: add optional fields only, and update both specs.
 */
export const endpoints = {
  variants:   { method: "GET",  path: "/variants",   response: VariantsResponse,   fixture: "variants" },
  vote:       { method: "POST", path: "/votes",      response: VoteResponse,       fixture: "vote",       request: VoteRequest },
  results:    { method: "GET",  path: "/results",    response: ResultsResponse,    fixture: "results" },
  challenger: { method: "POST", path: "/challenger", response: ChallengerResponse, fixture: "challenger", request: ChallengerRequest },
} as const;

export type EndpointName = keyof typeof endpoints;
export type ResponseOf<N extends EndpointName> = z.infer<(typeof endpoints)[N]["response"]>;
export type RequestOf<N extends EndpointName> = (typeof endpoints)[N] extends { request: infer R extends z.ZodTypeAny } ? z.infer<R> : never;

/** Substitute `:param` segments. Keeps path building in one place. */
export function buildPath<N extends EndpointName>(name: N, params: Record<string, string> = {}): string {
  return endpoints[name].path.replace(/:(\w+)/g, (_, k: string) => {
    const v = params[k];
    if (v === undefined) throw new Error(`buildPath(${name}): missing param "${k}"`);
    return encodeURIComponent(v);
  });
}
