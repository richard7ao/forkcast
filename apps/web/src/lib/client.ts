import { buildPath, endpoints, type EndpointName, type ResponseOf } from "@hack/contract";

/**
 * Every network read goes through here so that a malformed response fails
 * loudly at the boundary, next to the schema that describes it, rather than
 * as an undefined three components deep during the demo.
 */
export async function fetchTyped<N extends EndpointName>(
  name: N,
  opts: { params?: Record<string, string>; query?: Record<string, string>; body?: unknown } = {},
): Promise<ResponseOf<N>> {
  const ep = endpoints[name];
  const qs = opts.query && Object.keys(opts.query).length ? `?${new URLSearchParams(opts.query)}` : "";
  const res = await fetch(`/api${buildPath(name, opts.params ?? {})}${qs}`, {
    method: ep.method,
    headers: { "content-type": "application/json" },
    body: ep.method === "GET" ? undefined : JSON.stringify(opts.body ?? {}),
    cache: "no-store",
  });
  const json: unknown = await res.json();
  if (!res.ok) throw new Error(`${name}: ${res.status} ${JSON.stringify(json)}`);
  return ep.response.parse(json) as ResponseOf<N>;
}
