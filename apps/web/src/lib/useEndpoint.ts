"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchTyped } from "./client";
import type { EndpointName, ResponseOf } from "@hack/contract";

/**
 * Deliberately not react-query: one hook, no cache layer, no extra dependency
 * to explain. `reload` exists so an action can refresh its own panel without
 * lanes needing to share state.
 */
export function useEndpoint<N extends EndpointName>(
  name: N,
  opts: { params?: Record<string, string>; query?: Record<string, string> } = {},
) {
  const key = JSON.stringify(opts);
  const [data, setData] = useState<ResponseOf<N> | null>(null);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(() => {
    let live = true;
    fetchTyped(name, JSON.parse(key) as typeof opts)
      .then((d) => live && (setData(d), setError(null)))
      .catch((e) => live && setError(e));
    return () => { live = false; };
  }, [name, key]);

  useEffect(reload, [reload]);
  return { data, error, loading: !data && !error, reload };
}
