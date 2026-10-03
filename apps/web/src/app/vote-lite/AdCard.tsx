import { useState } from "react";
import type { Product, Variant } from "@hack/contract";
import { hashString } from "./lite";

/** A Meta-style feed card. /watch-humans shows ads with it too, so both pages render an ad the same way. */
export function AdCard({ product, variant }: { product: Product; variant: Variant }) {
  const [imageFailed, setImageFailed] = useState(false);
  const brandColor = `hsl(${hashString(product.brand) % 360} 55% 30%)`;
  return (
    <article className="overflow-hidden rounded-xl bg-white text-neutral-900">
      <header className="flex items-center gap-3 p-3">
        <div
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full text-lg font-bold text-white"
          style={{ backgroundColor: brandColor }}
        >
          {product.brand.charAt(0).toUpperCase()}
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold">{product.brand}</div>
          <div className="text-xs text-neutral-500">Sponsored</div>
        </div>
      </header>
      <p className="px-3 pb-3 text-[15px] leading-snug">{variant.body}</p>
      {imageFailed ? (
        <div
          className="grid aspect-[4/3] place-items-center p-6 text-center text-xl font-bold text-white"
          style={{ backgroundColor: brandColor }}
        >
          {product.name}
        </div>
      ) : (
        <img
          src={variant.imageUrl ?? product.imageUrl}
          alt={product.name}
          onError={() => setImageFailed(true)}
          className="aspect-[4/3] w-full bg-neutral-200 object-cover"
        />
      )}
      <div className="flex items-center gap-3 bg-neutral-100 p-3">
        <h2 className="min-w-0 flex-1 text-[15px] font-semibold leading-tight">{variant.headline}</h2>
        <span className="shrink-0 select-none rounded-full bg-neutral-200 px-4 py-2 text-sm font-semibold">{variant.cta}</span>
      </div>
      <p className="px-3 py-2 text-[11px] text-neutral-500">Concept test, not a real ad</p>
    </article>
  );
}
