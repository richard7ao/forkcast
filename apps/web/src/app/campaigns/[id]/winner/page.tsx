"use client";
import { useParams } from "next/navigation";
import { ErrorNote, Skeleton } from "../../../../components/ui";
import { useEndpoint } from "../../../../lib/useEndpoint";
import { TopBar, WRAP } from "../TopBar";
import { Winner } from "../Winner";

/** /campaigns/:id/winner: the winner's performance page, reached from the rail, the top bar and the rollout summary. */
export default function WinnerPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useEndpoint("campaign", { params: { id } });
  const c = data?.campaign;
  return (
    <div className="theme-e pb-16">
      <TopBar campaign={c} />
      <div className={WRAP}>
        {c ? (
          <Winner campaign={c} />
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
