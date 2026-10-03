import Link from "next/link";

/** Index of the three screens. The frontend lane owns this file after the harness commit. */
export default function Page() {
  const mode = process.env.DATA_MODE ?? "fixture";
  return (
    <main className="mx-auto max-w-xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Forkcast</h1>
        <p className="text-sm text-muted">Sealed AI forecasts for food ads, graded by the room. {mode} mode.</p>
      </header>
      <ul className="space-y-2 underline">
        <li><Link href="/vote">/vote</Link> phones</li>
        <li><Link href="/qr">/qr</Link> lunch laptop</li>
        <li><Link href="/dashboard">/dashboard</Link> big screen</li>
      </ul>
    </main>
  );
}
