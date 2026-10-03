import Link from "next/link";

/** The forkcast mark and wordmark, linking home. */
export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-[22px] font-medium tracking-[-0.04em] text-ink">
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-full text-base font-medium tracking-normal text-white"
        style={{ background: "conic-gradient(#F0A6FF, #7C8CFF, #9A66FF, #F0A6FF)" }}
      >
        f
      </span>
      forkcast
    </Link>
  );
}
