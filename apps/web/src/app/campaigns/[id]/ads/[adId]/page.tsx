"use client";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { Campaign } from "@hack/contract";
import { ErrorNote, Skeleton } from "../../../../../components/ui";
import { useEndpoint } from "../../../../../lib/useEndpoint";
import { TopBar, WRAP } from "../../TopBar";
import { AdReport } from "../../Winner";

export default function Page() {
  return (
    <Suspense>
      <AdPage />
    </Suspense>
  );
}

/** /campaigns/:id/ads/:adId?gen=N: how one ad performed. Without ?gen, its latest generation. */
function AdPage() {
  const { id, adId } = useParams<{ id: string; adId: string }>();
  const genParam = useSearchParams().get("gen");
  const { data, error, reload } = useEndpoint("campaign", { params: { id } });
  const c = data?.campaign;
  return (
    <div className="theme-e pb-16">
      <TopBar campaign={c} />
      <div className={WRAP}>
        {c ? (
          <Report c={c} adId={decodeURIComponent(adId)} gen={genParam == null ? null : Number(genParam)} />
        ) : error ? (
          <div className="mt-10 flex flex-col items-start gap-4">
            <ErrorNote error={error} />
            <button type="button" onClick={reload} className="e-pill e-outline">Try again</button>
          </div>
        ) : (
          <div className="mt-10"><Skeleton rows={6} /></div>
        )}
      </div>
    </div>
  );
}

function Report({ c, adId, gen }: { c: Campaign; adId: string; gen: number | null }) {
  const has = (g: Campaign["generations"][number]) => g.ads.some((a) => a.id === adId);
  const g = c.generations.find((x) => x.gen === gen && has(x)) ?? [...c.generations].reverse().find(has);
  const ad = g?.ads.find((a) => a.id === adId);
  if (!g || !ad) return <p role="alert" className="mt-12 text-lg text-bad">No ad {adId} in this campaign.</p>;
  return <AdReport campaign={c} ad={ad} gen={g} />;
}
