/**
 * A breakout group's *effective* gender focus.
 *
 * Client-safe on purpose: no Prisma, no React. This used to live in
 * `lib/matching/index.ts`, which pulls in the database and `unstable_cache` — so
 * the public registration path couldn't reach it and fell back to the raw
 * `genderFocus` column instead. That split meant a group whose focus is only
 * implied by its facilitator read as "open to everyone" on the public form while
 * every admin surface treated it as gendered.
 */

export type GenderFocusValue = "Male" | "Female" | "Mixed"

/**
 * Precedence: an explicit `genderFocus` on the group wins; otherwise infer from
 * the facilitator(s)' gender (two different genders → "Mixed"); otherwise fall
 * back to the linked DGroup's focus; otherwise null (matches everyone).
 */
export function deriveEffectiveGenderFocus(
  explicitFocus: GenderFocusValue | null,
  facilitatorGender: "Male" | "Female" | null | undefined,
  coFacilitatorGender: "Male" | "Female" | null | undefined,
  linkedSmallGroupGenderFocus?: GenderFocusValue | null
): GenderFocusValue | null {
  if (explicitFocus !== null) return explicitFocus

  const genders = [facilitatorGender, coFacilitatorGender].filter(
    (g): g is "Male" | "Female" => g === "Male" || g === "Female"
  )
  if (genders.length > 0) {
    const unique = [...new Set(genders)]
    return unique.length > 1 ? "Mixed" : unique[0]
  }

  if (linkedSmallGroupGenderFocus != null) return linkedSmallGroupGenderFocus

  return null
}

/**
 * Can someone of this gender join a group with this focus?
 *
 * `null`/`Mixed` focus accepts everyone, and an unknown candidate gender is
 * never treated as a mismatch — callers that want to hide gendered groups from
 * someone who wasn't asked must decide that for themselves.
 */
export function genderFocusAccepts(
  focus: GenderFocusValue | null,
  gender: "Male" | "Female" | null
): boolean {
  if (!focus || focus === "Mixed") return true
  if (!gender) return true
  return focus === gender
}
