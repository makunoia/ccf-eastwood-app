/**
 * Pure matching logic used by both server and client.
 * Hardcoded to Gender / Age / Capacity — distinct from the weighted matching
 * engine in lib/matching (which is admin-facing and configurable).
 */

import type { Gender, GenderFocus } from "@/app/generated/prisma/client"
import { breakoutOccupancy, type BreakoutOccupancy, type CapacityInput } from "@/lib/breakouts/occupancy"
import { genderFocusAccepts } from "@/lib/breakouts/gender-focus"

/**
 * Capacity arrives here already reduced to `isFull` + `roomRatio` so the raw
 * headcount never has to be shipped to a browser that isn't allowed to see it.
 * `occupancy` carries the numbers, and is null on the public registration form
 * — see `withoutOccupancy`.
 */
export type BreakoutCandidate = {
  id: string
  name: string
  genderFocus: GenderFocus | null
  ageRangeMin: number | null
  ageRangeMax: number | null
  /** Derived server-side via `breakoutOccupancy`. */
  isFull: boolean
  /** Share of the cap still open, 0..1. `null` when uncapped. Feeds `score` only. */
  roomRatio: number | null
  /** Raw counts — staffed surfaces only. `null` on the public form. */
  occupancy: CapacityInput | null
}

export type RegistrantProfile = {
  gender: Gender | null
  birthYear: number | null
}

function ageFromBirthYear(birthYear: number | null): number | null {
  if (birthYear == null) return null
  return new Date().getUTCFullYear() - birthYear
}

function isEligible(group: BreakoutCandidate, p: RegistrantProfile): boolean {
  // A *suggestion* never points at a full group, even though the browse list
  // now lets a staffed operator pick one deliberately.
  if (group.isFull) return false

  if (group.genderFocus && group.genderFocus !== "Mixed") {
    if (!p.gender || group.genderFocus !== p.gender) return false
  }

  const age = ageFromBirthYear(p.birthYear)
  if (group.ageRangeMin != null || group.ageRangeMax != null) {
    if (age == null) return false
    if (group.ageRangeMin != null && age < group.ageRangeMin) return false
    if (group.ageRangeMax != null && age > group.ageRangeMax) return false
  }

  return true
}

/**
 * Higher = better fit. Prefer groups that specifically target the registrant
 * (e.g. genderFocus=Male over Mixed; an age range over none) and have room.
 */
function score(group: BreakoutCandidate): number {
  let s = 0
  if (group.genderFocus && group.genderFocus !== "Mixed") s += 2
  if (group.ageRangeMin != null || group.ageRangeMax != null) s += 1
  s += group.roomRatio ?? 0.5
  return s
}

export type BreakoutPickerOption = BreakoutCandidate & {
  /** Rendered occupancy. `null` when the counts weren't shipped to this surface. */
  occupancyView: BreakoutOccupancy | null
}

/**
 * Drops the raw headcounts, keeping the derived `isFull` / `roomRatio` the
 * picker and the suggester actually need.
 *
 * The public registration form calls this. Occupancy is an admin-facing
 * operational number: a registrant choosing a group has no business knowing how
 * many people are in it, and until this existed the counts were sitting in the
 * public form's RSC payload — unrendered, but there for anyone who looked.
 * Whether a group is *full* is still surfaced, because that's a boolean about
 * the choice in front of them rather than an occupancy figure.
 */
export function withoutOccupancy(groups: BreakoutCandidate[]): BreakoutCandidate[] {
  return groups.map((g) => ({ ...g, occupancy: null }))
}

/**
 * The groups a registrant may browse, in the order they arrived.
 *
 * Gender is the one criterion applied here, and only when it is *known*: a men's
 * breakout group is not something a woman can join, so offering it is a dead end
 * she can walk into. Everything else — age, capacity — is surfaced rather than
 * applied, because those are soft preferences and a full group still renders
 * marked so it doesn't look like it vanished.
 *
 * When gender is absent (blank, or the form never asked) nothing is filtered.
 * An earlier version filtered on age and on missing gender too, which meant a
 * registrant who wasn't asked saw every gendered and age-ranged group disappear:
 * missing data read as a mismatch and the list could empty out entirely.
 *
 * Pass the *effective* focus — `fetchBreakoutCandidates` already resolves it
 * through `deriveEffectiveGenderFocus`, so a group whose focus is only implied
 * by its facilitator filters the same way an explicit one does.
 */
export function breakoutPickerOptions(
  groups: BreakoutCandidate[],
  profile?: { gender: Gender | null }
): BreakoutPickerOption[] {
  return groups
    .filter((g) => genderFocusAccepts(g.genderFocus, profile?.gender ?? null))
    .map((g) => ({
      ...g,
      occupancyView: g.occupancy ? breakoutOccupancy(g.occupancy) : null,
    }))
}

export function suggestBreakoutGroup(
  groups: BreakoutCandidate[],
  profile: RegistrantProfile
): BreakoutCandidate | null {
  const eligible = groups.filter((g) => isEligible(g, profile))
  if (eligible.length === 0) return null
  return eligible.slice().sort((a, b) => score(b) - score(a))[0]
}

/**
 * Why the breakout step is rendering with nothing to choose from.
 *
 * Only `awaiting-facilitator` exists today: the walk-in kiosk offers a group
 * only once its facilitator has checked in, so before the team arrives every
 * group is held back. Left as a union so the next such rule gets its own copy
 * rather than being folded into this one.
 */
export type BreakoutNoticeKind = "awaiting-facilitator"

/**
 * Decides whether an empty breakout list is worth explaining.
 *
 * The distinction that matters is "no groups exist" (nothing to say — drop the
 * step) versus "groups exist but all are gated" (say so). Dropping the step in
 * the second case is what made an enabled Breakout toggle look like it did
 * nothing on the walk-in form.
 */
export function resolveBreakoutNotice(opts: {
  offerPicker: boolean
  candidateCount: number
  totalGroups: number
}): BreakoutNoticeKind | null {
  if (!opts.offerPicker) return null
  if (opts.candidateCount > 0) return null
  return opts.totalGroups > 0 ? "awaiting-facilitator" : null
}
