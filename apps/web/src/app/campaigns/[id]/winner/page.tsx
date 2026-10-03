"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ErrorNote, Skeleton } from "../../../../components/ui";
import { useEndpoint } from "../../../../lib/useEndpoint";
import { AdDrawer, type OpenAd } from "../AdDrawer";
import { TopBar, WRAP } from "../TopBar";
import { Winner } from "../Winner";

/** /campaigns/:id/winner: the fittest ad on its own page, reached from the rail, the top bar and the rollout summary. */
export default function WinnerPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useEndpoint("campaign", { params: { id } });
  const [open, setOpen] = useState<OpenAd>(null);
  const c = data?.campaign;
  return (
    <div className="theme-e pb-16">
      <TopBar campaign={c} />
      <div className={WRAP}>
        {c ? (
          <Winner campaign={c} onOpen={(adId) => setOpen({ id: adId })} />
        ) : error ? (
          <div className="mt-10 flex flex-col items-start gap-4">
            <ErrorNote error={error} />
            <button type="button" onClick={reload} className="e-pill e-outline">Try again</button>
          </div>
        ) : (
          <div className="mt-10"><Skeleton rows={6} /></div>
        )}
      </div>
      {c && <AdDrawer campaign={c} open={open} onOpen={(adId) => setOpen({ id: adId })} onClose={() => setOpen(null)} />}
    </div>
  );
}
