/** Structural on purpose: the contract's Ad satisfies it, and nothing here imports the contract. */
export type ExportAd = {
  id: string;
  headline: string;
  body: string;
  cta: string;
  imageUrl?: string | undefined;
  lever: string;
  status: string;
};

const COLUMNS = ["Campaign Name", "Ad Set Name", "Ad Name", "Title", "Body", "Call to Action", "Image URL", "Link"];
const AD_SET = "Forkcast survivors";

/** First match wins; anything unrecognised is a plain shop button. Whole words only ("ideal" is not "deal"). */
const CTA_RULES: [RegExp, string][] = [
  [/\border\b/i, "ORDER_NOW"],
  [/\b(offer|deal|discount|coupon|save)\b/i, "GET_OFFER"],
  [/\b(learn|discover|find out|explore|read|check|facts?|recipes?)\b/i, "LEARN_MORE"],
];
const metaCta = (text: string) => CTA_RULES.find(([re]) => re.test(text.replace(/_/g, " ")))?.[1] ?? "SHOP_NOW";

/** RFC 4180 quoting. A leading = + - @ (or tab/CR) would run as a formula in a spreadsheet, so it gets a quote prefix. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * CSV in the shape of Meta Ads Manager's bulk import, core columns only: it is not the full import
 * template and makes no claim to be. Exports survivors and the winner, in the order given, so pass
 * one generation's ads. Image URLs resolve against siteUrl (the public origin that serves /generated/);
 * a malformed siteUrl throws before any row is written.
 */
export function toMetaCsv(campaignName: string, ads: readonly ExportAd[], siteUrl: string): string {
  const site = new URL(siteUrl);
  const rows = ads
    .filter((ad) => ad.status === "survivor" || ad.status === "winner")
    .map((ad) => [
      campaignName,
      AD_SET,
      `${ad.id} ${ad.lever}`,
      ad.headline,
      ad.body,
      metaCta(ad.cta),
      ad.imageUrl ? new URL(ad.imageUrl, site).href : "",
      siteUrl,
    ]);
  return [COLUMNS, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}
