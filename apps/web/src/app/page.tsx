"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CreateCampaignRequest } from "@hack/contract";
import { Logo } from "../components/Logo";
import { fetchTyped } from "../lib/client";

/** Real renders from the demo campaign, floating beside the form on wide screens. */
const FLOATS = [
  { src: "/generated/campaigns/d87ed849/scene-3.png", at: "left-12 top-28 -rotate-6" },
  { src: "/generated/campaigns/d87ed849/scene-0.png", at: "left-[88px] top-[468px] rotate-[4deg]" },
  { src: "/generated/campaigns/d87ed849/g1-health_halo-3-s1.png", at: "right-14 top-[104px] rotate-[5deg]" },
  { src: "/generated/campaigns/d87ed849/scene-4.png", at: "right-[84px] top-[460px] -rotate-[4deg]" },
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
  const [name, setName] = useState("");
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
      const body = CreateCampaignRequest.parse({ imageDataUrl: image.dataUrl, name: name.trim() || undefined });
      const res = await fetchTyped("createCampaign", { body });
      if (!res.ok || !res.campaignId) throw new Error(res.error ?? "The campaign did not start.");
      router.push(`/campaigns/${encodeURIComponent(res.campaignId)}`);
    } catch (err) {
      setError(`Could not start the campaign. ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  return (
    <div className="theme-e relative overflow-hidden">
      <header className="relative z-10 mx-auto flex max-w-[1344px] items-center px-4 py-6 md:px-10">
        <Logo />
      </header>
      {FLOATS.map((f) => (
        <div key={f.src} aria-hidden className={`e-pol absolute hidden w-[184px] min-[1300px]:block ${f.at}`}>
          <img src={f.src} alt="" className="block aspect-square w-full rounded-[10px] object-cover" />
        </div>
      ))}
      <main className="relative mx-auto flex max-w-[1344px] flex-col items-center px-4 pb-14 pt-12 text-center md:px-6">
        <h1 className="e-h text-[44px] md:text-[88px]">
          <span className="block">
            Only the <span className="rounded-[18px] bg-pistachio px-[0.14em] pb-[0.04em] [box-decoration-break:clone]">fittest</span>
          </span>
          <span className="block">ads survive.</span>
        </h1>
        <p className="mx-auto mt-[22px] max-w-[640px] text-[17px] leading-[1.45] text-muted md:text-xl md:leading-[1.45]">
          Drop one product photo. Forkcast writes 48 Meta ads, screens them with AI shoppers, then real people, breeds the survivors and exports the winner to Meta.
        </p>
        <form onSubmit={run} aria-label="New campaign" className="mt-9 flex w-full max-w-[760px] flex-wrap gap-4 rounded-[20px] border border-edge bg-white p-4 text-left">
          <div
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
            className={`flex flex-[1_1_320px] items-center gap-[18px] rounded-2xl border-[1.5px] border-dashed p-3.5 ${over ? "border-forest bg-pistachio/20" : "border-ink/30"}`}
          >
            <div className="e-pol w-[92px] flex-none -rotate-3 rounded-xl p-1.5 pb-2">
              {image ? (
                <img src={image.dataUrl} alt="Your upload" className="block aspect-[3/4] w-full rounded-[7px] object-cover" />
              ) : (
                <div aria-hidden className="grid aspect-[3/4] w-full place-items-center rounded-[7px] bg-track text-2xl text-muted">+</div>
              )}
            </div>
            <div className="flex min-w-0 flex-col items-start gap-1.5">
              {image && (
                <>
                  <span className="max-w-full truncate font-medium">{image.file.name}</span>
                  <span className="text-sm text-muted">{mb(image.file.size)}</span>
                </>
              )}
              <input id="image" type="file" accept={ACCEPT.join(",")} className="peer sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
              <label htmlFor="image" className="e-pill e-outline px-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ai">
                {image ? "Change image" : "Choose image"}
              </label>
              <span className="text-[13px] leading-snug text-muted">Drop one image, or choose a file. JPEG or PNG, up to 6 MB.</span>
            </div>
          </div>
          <div className="flex flex-[1_1_240px] flex-col justify-end gap-2.5">
            <label htmlFor="name" className="pl-2 text-sm font-medium">Campaign name (optional)</label>
            <input
              id="name"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="EPIC summer s'mores"
              className="h-[52px] w-full rounded-full border border-ink/30 bg-white px-5 text-[17px]"
            />
            <button type="submit" disabled={busy} className="e-pill e-lime min-h-[52px] text-sm">
              {busy ? "Starting…" : "Run"}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14" />
                <path d="M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
          {error && <p role="alert" className="w-full px-2 text-sm text-bad">{error}</p>}
        </form>
        <button type="button" onClick={() => void pickDemoPhoto()} className="mt-6 cursor-pointer text-[15px] underline underline-offset-4">
          Or use the demo photo: EPIC Snax Giant Toastin&apos; Marshmallows
        </button>
        <p className="mt-4 text-[15px] text-muted">No campaigns yet. Next up: the same loop for Shopify product photos.</p>
      </main>
    </div>
  );
}
