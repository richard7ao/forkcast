import Link from "next/link";
import type { Campaign } from "@hack/contract";
import { Logo } from "../../../components/Logo";
import { winnerOf } from "./format";

export const WRAP = "mx-auto w-full max-w-[1344px] px-4 md:px-12";

/** A Winner pill as soon as any generation is ranked, so the winner page is one tap from anywhere in the campaign. */
export function TopBar({ campaign }: { campaign?: Campaign }) {
  return (
    <header className="border-b border-line">
      <div className={`${WRAP} flex flex-wrap items-center justify-between gap-3 py-[18px]`}>
        <Logo />
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {campaign && winnerOf(campaign) && (
            <Link href={`/campaigns/${encodeURIComponent(campaign.id)}/winner`} className="e-pill e-lime px-5 text-[14px] font-semibold shadow-[0_4px_14px_rgb(43_168_74/0.35)]">★ Winner</Link>
          )}
          <Link href={campaign ? `/watch-humans?c=${encodeURIComponent(campaign.id)}` : "/watch-humans"} aria-label="Watch Humans integration" className="e-pill e-outline px-4">Watch Humans<span className="hidden sm:inline">&nbsp;integration</span></Link>
          <Link href="/" className="e-pill e-outline px-4">New<span className="hidden sm:inline">&nbsp;campaign</span></Link>
        </div>
      </div>
    </header>
  );
}
