/** Numeric tokens; "10,000" and "10000" are the same number once thousands commas are stripped. */
const NUMBER = /\d+(?:[.,]\d+)*/g;
const normalise = (token: string) => token.replace(/,/g, "");

/**
 * Digit sequences in ad copy that appear in no fact, as written in the copy: the deterministic guard
 * against invented stats ("Loved by 10,000 Londoners"). Empty when every number is backed by a fact.
 * ponytail: matches digits, not meaning ("100% lentil" passes if a fact says "per 100g"); the prompt's truth rule covers semantics.
 */
export function inventedNumbers(text: string, facts: string[]): string[] {
  const allowed = new Set(facts.flatMap((fact) => (fact.match(NUMBER) ?? []).map(normalise)));
  return (text.match(NUMBER) ?? []).filter((token) => !allowed.has(normalise(token)));
}

const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "hundreds?", "thousands?", "millions?"];
const CLAIM_PHRASES = ["best[- ]?sell(?:ing|ers?)", "award-winning", "awards?", "number one", "most popular", "loved by", "favou?rites? of", "voted", "limited[- ](?:edition|batch)", "small[- ]batch", "selling (?:out )?fast", "selling out", "sold out", "only a few left", "while stocks? lasts?", "vegans?", "vegetarians?", "plant[- ]?(?:based|power(?:ed)?)"];
/** Claim phrases come first so "number one" and "award-winning" are reported whole. */
const BANNED = new RegExp(`\\b(?:${[...CLAIM_PHRASES, ...NUMBER_WORDS].join("|")})\\b|#1\\b`, "gi");

/**
 * Words that dodge the digit check (spelled-out numbers) or claim what no pack can back (sales, awards,
 * popularity, stock, and diet labels this pork-gelatine product cannot carry), as written in the copy.
 * Subjective framing ("pillowy", "the bag everyone grabs") passes.
 */
export function bannedClaims(text: string): string[] {
  return text.match(BANNED) ?? [];
}
