/**
 * The breakout group's explicit gender focus. Blank means any gender.
 */

export type GenderFocusValue = "Male" | "Female" | "Mixed"

export function deriveEffectiveGenderFocus(explicitFocus: GenderFocusValue | null): GenderFocusValue | null {
  return explicitFocus
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
