"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type FormEvent } from "react";
import { CreateCampaignRequest } from "@hack/contract";
import { Logo } from "../components/Logo";
import { fetchTyped } from "../lib/client";
import { errorText } from "./campaigns/[id]/format";

/**
 * Real renders from the demo campaign, floating beside the form on wide screens. ctr and ai are the best ad on each
 * image in data/campaigns/demo-epic.json: simulated CTR and the AI shopper tap rate, in percent.
 */
const FLOATS = [
  { src: "/generated/campaigns/d87ed849/scene-3.png", at: "left-12 top-28 -rotate-6", ctr: 2.4, ai: 55 },
  { src: "/generated/campaigns/d87ed849/scene-0.png", at: "left-[88px] top-[468px] rotate-[4deg]", ctr: 1.1, ai: 55 },
  { src: "/generated/campaigns/d87ed849/g1-health_halo-3-s1.png", at: "right-14 top-[104px] rotate-[5deg]", ctr: 0.8, ai: 38 },
  { src: "/generated/campaigns/d87ed849/scene-4.png", at: "right-[84px] top-[460px] -rotate-[4deg]", ctr: 1.0, ai: 10 },
];
const ACCEPT = ["image/jpeg", "image/png"];
/** The demo pack photo. Sent byte for byte, it matches an earlier run, so the API reuses that run's renders. */
const DEMO_PHOTO = "/generated/campaigns/d87ed849/source-crop.jpg";

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

/** New campaign: one image in, then straight to the live campaign. */
export default function Page() {
  const router = useRouter();
  const [image, setImage] = useState<{ file: File; dataUrl: string } | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!ACCEPT.includes(file.type)) return setError("Use a JPEG or PNG image.");
    try {
      const dataUrl = await readAsDataUrl(file);
      // Check against the contract here, so the upload is never bounced by the API.
      const check = CreateCampaignRequest.shape.imageDataUrl.safeParse(dataUrl);
      if (!check.success) {
        return setError(check.error.issues.some((i) => i.code === "too_big") ? `That image is ${mb(file.size)}. Use one under 6 MB.` : "Use a JPEG or PNG image.");
      }
      setImage({ file, dataUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function pickDemoPhoto() {
    try {
      const res = await fetch(DEMO_PHOTO);
      if (!res.ok) throw new Error(`The demo photo did not load (${res.status}).`);
      await pick(new File([await res.blob()], "epic-snax-demo.jpg", { type: "image/jpeg" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function run(e: FormEvent) {
    e.preventDefault();
    if (!image) return setError("Choose an image first.");
    setBusy(true);
    setError(null);
    try {
      const body = CreateCampaignRequest.parse({ imageDataUrl: image.dataUrl });
      const res = await fetchTyped("createCampaign", { body });
      if (!res.ok || !res.campaignId) throw new Error(res.error ?? "The campaign did not start.");
      router.push(`/campaigns/${encodeURIComponent(res.campaignId)}`);
    } catch (err) {
      setError(`Could not start the campaign. ${errorText(err)}`);
      setBusy(false);
    }
  }

  return (
    <div className="theme-e relative overflow-hidden">
      <header className="relative z-10 mx-auto flex max-w-[1344px] items-center justify-between gap-3 px-4 py-6 md:px-10">
        <Logo />
        <Link href="/watch-humans" aria-label="Watch Humans integration" className="e-pill e-outline px-4">Watch Humans<span className="hidden sm:inline">&nbsp;integration</span></Link>
      </header>
      {FLOATS.map((f, i) => (
        <div key={f.src} aria-hidden className={`fk-float absolute hidden w-[184px] min-[1300px]:block ${f.at}`} style={{ "--d": `${i * -1.4}s` } as CSSProperties}>
          <div className="e-pol">
            <img src={f.src} alt="" loading="lazy" className="block aspect-square w-full rounded-[10px] object-cover" />
            <p className="mt-2.5 flex justify-center gap-3 text-[11px] font-medium tabular-nums">
              <span><span className="text-forest">▲</span> sim CTR {f.ctr.toFixed(1)}%</span>
              <span><span className="text-ai">AI</span> {f.ai}%</span>
            </p>
          </div>
        </div>
      ))}
      <main className="relative mx-auto flex max-w-[1344px] flex-col items-center px-4 pb-14 pt-12 text-center md:px-6">
        <h1 className="e-h fk-blur-in text-[44px] md:text-[88px]">
          <span className="block">Only the fittest</span>
          <span className="rounded-[18px] bg-pistachio px-[0.14em] pb-[0.04em] [box-decoration-break:clone]">ads survive.</span>
        </h1>
        <p style={{ "--d": "120ms" } as CSSProperties} className="fk-pop mx-auto mt-[22px] max-w-[640px] text-[17px] leading-[1.45] text-muted md:text-xl md:leading-[1.45]">
          Drop one product photo. Forkcast writes 48 Meta ads, tests them on AI shoppers and a simulated Meta delivery, breeds the survivors and exports the winner to Meta.
        </p>
        {/* One pill, as on getgimmegimme.com: the whole left side is the file picker and the drop target. */}
        <form
          onSubmit={run}
          aria-label="New campaign"
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void pick(e.dataTransfer.files[0]);
          }}
          style={{ "--d": "220ms" } as CSSProperties}
          className={`fk-pop mt-9 flex w-full max-w-[600px] items-center gap-2 rounded-full border bg-white p-2 text-left shadow-[0_1px_2px_rgb(0_0_0/0.06),0_14px_36px_rgb(0_0_0/0.08)] transition-colors ${over ? "border-forest bg-pistachio/20" : "border-edge"}`}
        >
          <input id="image" type="file" accept={ACCEPT.join(",")} className="peer sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
          <label
            htmlFor="image"
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-full py-1 pl-2 pr-1 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ai"
          >
            {image ? (
              <img src={image.dataUrl} alt="Your upload" className="size-9 flex-none rounded-full object-cover" />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="ml-1.5 flex-none text-muted">
                <rect x="3" y="4" width="18" height="16" rx="3" />
                <circle cx="9" cy="10" r="1.6" />
                <path d="M21 16l-5-5-9 9" />
              </svg>
            )}
            <span className="min-w-0 truncate text-[16px] text-muted">
              {image ? (
                <><span className="text-ink">{image.file.name}</span> · {mb(image.file.size)}</>
              ) : (
                <><span className="sm:hidden">Choose a pack photo</span><span className="hidden sm:inline">Drop a pack photo, or choose one</span></>
              )}
            </span>
          </label>
          <button type="submit" disabled={busy} className="inline-flex h-12 flex-none cursor-pointer items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? "Starting…" : <>Create<span className="hidden sm:inline">&nbsp;marketing</span>&nbsp;experiment</>}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
        <p className="mt-3 text-[13px] text-muted">JPEG or PNG, up to 6 MB.</p>
        {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
        <button type="button" onClick={() => void pickDemoPhoto()} style={{ "--d": "320ms" } as CSSProperties} className="fk-pop mt-6 cursor-pointer text-[15px] underline underline-offset-4">
          Or use the demo photo: EPIC Snax Giant Toastin&apos; Marshmallows
        </button>
        <p className="mt-4 text-[15px] text-muted">Next up: the same loop for Shopify product photos.</p>
      </main>
    </div>
  );
}
