/**
 * Pure matching logic used by both server and client.
 * Hardcoded to Gender / Age / Capacity — distinct from the weighted matching
 * engine in lib/matching (which is admin-facing and configurable).
 */

import type { Gender, GenderFocus } from "@/app/generated/prisma/client"

export type BreakoutCandidate = {
  id: string
  name: string
  genderFocus: GenderFocus | null
  ageRangeMin: number | null
  ageRangeMax: number | null
  memberLimit: number | null
  memberCount: number
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
  if (group.memberLimit != null && group.memberCount >= group.memberLimit) return false

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
  if (group.memberLimit != null) {
    const remaining = group.memberLimit - group.memberCount
    s += remaining / group.memberLimit
  } else {
    s += 0.5
  }
  return s
}

/** Returns groups compatible by gender/age, ignoring capacity (for browsable lists). */
export function filterCompatibleCandidates(
  groups: BreakoutCandidate[],
  profile: RegistrantProfile
): BreakoutCandidate[] {
  return groups.filter((g) => {
    if (g.genderFocus && g.genderFocus !== "Mixed") {
      if (!profile.gender || g.genderFocus !== profile.gender) return false
    }
    const age = ageFromBirthYear(profile.birthYear)
    if (g.ageRangeMin != null || g.ageRangeMax != null) {
      if (age == null) return false
      if (g.ageRangeMin != null && age < g.ageRangeMin) return false
      if (g.ageRangeMax != null && age > g.ageRangeMax) return false
    }
    return true
  })
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
