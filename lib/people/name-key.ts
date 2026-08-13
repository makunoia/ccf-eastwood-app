/**
 * Canonical grouping key for a person's name.
 *
 * Duplicate detection used to run on phone and email only. Those are exact-match
 * identifiers, but plenty of real duplicates arrive with no contact info at all —
 * a walk-in typed in twice, an import that ran before phones were collected. Those
 * pairs are invisible to a contact-only report, so names need a key of their own.
 *
 * A name is a much weaker identifier than a phone number: two different people
 * genuinely share one. The key below is therefore built to be *forgiving about
 * formatting* and *strict about content* — it folds away the ways the same name
 * gets typed differently, and never folds away anything that distinguishes two
 * people.
 *
 * Folded away:
 * - case, accents ("Niño" → "nino"), punctuation ("O'Brien" → "o brien")
 * - stray/collapsed whitespace
 * - which column a name part landed in — tokens are sorted, so first/last swaps
 *   ("Maria Santos" vs "Santos, Maria") and a full name pasted into `firstName`
 *   both land on the same key
 *
 * Deliberately NOT folded away:
 * - generational suffixes (Jr/Sr/III). "Juan Cruz Jr" and "Juan Cruz" are usually
 *   a son and his father — collapsing them would propose merging two real people.
 * - single-token names. One shared given name is not evidence of a duplicate, so
 *   a record without at least two name tokens gets no key at all.
 */

/** Lowercase, de-accent, strip punctuation, and split into name tokens. */
export function personNameTokens(...parts: (string | null | undefined)[]): string[] {
  return parts
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // combining accents left behind by NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * The grouping key for a name, or `null` when the name is too thin to group on
 * (fewer than two tokens). Tokens are sorted so column order doesn't matter.
 */
export function personNameKey(...parts: (string | null | undefined)[]): string | null {
  const tokens = personNameTokens(...parts)
  if (tokens.length < 2) return null
  return [...tokens].sort().join(" ")
}

/** Display form of a name — the parts as typed, with whitespace tidied. */
export function displayPersonName(...parts: (string | null | undefined)[]): string {
  return parts
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}
