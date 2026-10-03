/**
 * Frozen primitives. Lanes compose these instead of inventing their own card
 * or table, which is what keeps four parallel agents from producing four
 * visual dialects in one screen.
 */
export function Card({ title, action, children, className = "" }: {
  title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-xl border border-edge bg-panel p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between">
          {title && <h2 className="text-sm font-medium tracking-wide text-muted uppercase">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

const fmt = (value: number, unit: string) =>
  unit === "currency" ? value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })
  : unit === "percent" ? `${(value * 100).toFixed(1)}%`
  : unit === "duration" ? `${value.toFixed(1)}d`
  : value.toLocaleString();

export function Stat({ label, value, unit = "count", delta, hero = false }: {
  label: string; value: number; unit?: string; delta?: number | null; hero?: boolean;
}) {
  return (
    <div className="rounded-xl border border-edge bg-panel p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-2 font-semibold tabular-nums ${hero ? "text-4xl" : "text-2xl"}`}>{fmt(value, unit)}</div>
      {delta != null && (
        <div className={`mt-1 text-xs tabular-nums ${delta >= 0 ? "text-good" : "text-bad"}`}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

const TONE: Record<string, string> = {
  new: "bg-accent/15 text-accent", active: "bg-good/15 text-good",
  done: "bg-muted/15 text-muted", blocked: "bg-bad/15 text-bad",
};

export function StatusPill({ status }: { status: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[status] ?? "bg-muted/15 text-muted"}`}>{status}</span>;
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="h-9 animate-pulse rounded bg-edge/60" />)}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  return <p className="text-sm text-bad">{error instanceof Error ? error.message : String(error)}</p>;
}
