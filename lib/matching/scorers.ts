import type { TimeSlot } from "./types"

export const AGE_DECAY_YEARS = 10

/**
 * A factor's score plus whether it was actually *measured*.
 *
 * `known: false` means we had no data to compare — the 0.5 is a neutral
 * placeholder, not a real half-fit. Keeping the two apart is what lets the UI
 * say "we don't know" instead of quietly presenting a guess as a result, and
 * what feeds the match confidence signal.
 */
export type FactorScore = { score: number; known: boolean }

const known = (score: number): FactorScore => ({ score, known: true })
const unknown: FactorScore = { score: 0.5, known: false }

function parseMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

function slotsOverlap(a: TimeSlot, b: TimeSlot): boolean {
  if (a.dayOfWeek !== b.dayOfWeek) return false
  const aStart = parseMinutes(a.timeStart)
  const aEnd = parseMinutes(a.timeEnd)
  const bStart = parseMinutes(b.timeStart)
  const bEnd = parseMinutes(b.timeEnd)
  return aStart < bEnd && bStart < aEnd
}

// ─── Detailed scorers ─────────────────────────────────────────────────────────
// These hold the real logic. The plain `scoreX` exports below are thin wrappers
// so there is exactly one definition of each rule.

export function scoreLifeStageDetailed(
  candidateLifeStageId: string | null,
  groupLifeStageIds: string[]
): FactorScore {
  if (groupLifeStageIds.length === 0) return unknown // group accepts all
  if (candidateLifeStageId === null) return unknown // no data on candidate
  return known(groupLifeStageIds.includes(candidateLifeStageId) ? 1.0 : 0.0)
}

export function scoreGenderDetailed(
  candidateGender: "Male" | "Female" | null,
  groupGenderFocus: "Male" | "Female" | "Mixed" | null
): FactorScore {
  if (groupGenderFocus === null || groupGenderFocus === "Mixed") return known(1.0)
  if (candidateGender === null) return unknown
  return known(candidateGender === groupGenderFocus ? 1.0 : 0.0)
}

export function scoreLanguageDetailed(
  candidateLanguages: string[],
  groupLanguages: string[]
): FactorScore {
  if (groupLanguages.length === 0) return unknown // group has no language preference
  if (candidateLanguages.length === 0) return unknown // no data on candidate
  return known(candidateLanguages.some((l) => groupLanguages.includes(l)) ? 1.0 : 0.0)
}

export function scoreAgeDetailed(
  candidateBirthMonth: number | null,
  candidateBirthYear: number | null,
  groupAgeRangeMin: number | null,
  groupAgeRangeMax: number | null
): FactorScore {
  if (candidateBirthYear === null) return unknown
  if (groupAgeRangeMin === null && groupAgeRangeMax === null) return unknown

  const now = new Date()
  const month = candidateBirthMonth ?? 1
  // Age in years using year and month (day assumed as 1)
  const approxBirthDate = new Date(candidateBirthYear, month - 1, 1)
  const age = Math.floor(
    (now.getTime() - approxBirthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  )

  const min = groupAgeRangeMin ?? 0
  const max = groupAgeRangeMax ?? Infinity

  if (age >= min && age <= max) return known(1.0)

  const distance = age < min ? min - age : age - max
  return known(Math.max(0, 1 - distance / AGE_DECAY_YEARS))
}

export function scoreScheduleDetailed(
  candidateSlots: TimeSlot[],
  groupSlots: TimeSlot[]
): FactorScore {
  if (candidateSlots.length === 0 || groupSlots.length === 0) return unknown

  const overlapping = groupSlots.filter((gs) =>
    candidateSlots.some((cs) => slotsOverlap(cs, gs))
  )
  return known(overlapping.length / groupSlots.length)
}

export function scoreLocationDetailed(
  candidateWorkCity: string | null,
  groupLocationCity: string | null
): FactorScore {
  if (candidateWorkCity === null || groupLocationCity === null) return unknown
  return known(candidateWorkCity === groupLocationCity ? 1.0 : 0.0)
}

export function scoreModeDetailed(
  candidatePref: "Online" | "Hybrid" | "InPerson" | null,
  groupFormat: "Online" | "Hybrid" | "InPerson" | null
): FactorScore {
  if (candidatePref === null || groupFormat === null) return unknown
  if (candidatePref === groupFormat) return known(1.0)
  if (candidatePref === "Hybrid" || groupFormat === "Hybrid") return known(0.5)
  return known(0.0)
}

/**
 * Scores how many people in the group share the candidate's industry.
 *
 * Deliberately counts peers rather than taking a share of the roster: a ratio
 * punishes big groups for being big (3 peers among 10 used to score 0.30 while
 * 1 peer among 2 scored 0.50), which is backwards — more peers is more
 * connection, however large the group. Saturates at 3 because the difference
 * between three and eight colleagues isn't a placement consideration.
 *
 * Zero peers is a weak signal, not a disqualifying one — being the only person
 * in your field doesn't make a group a bad fit.
 */
export function scoreCareerDetailed(
  candidateIndustry: string | null,
  memberIndustries: string[]
): FactorScore {
  if (candidateIndustry === null) return unknown
  if (memberIndustries.length === 0) return unknown
  const peers = memberIndustries.filter((i) => i === candidateIndustry).length
  if (peers === 0) return known(0.25)
  if (peers === 1) return known(0.7)
  if (peers === 2) return known(0.85)
  return known(1.0)
}

/**
 * Gentle load-balancing toward groups with room to breathe.
 *
 * Groups at capacity are already excluded upstream, so this only separates
 * groups that all have space. Scores on absolute open seats rather than the
 * fraction of the limit — a 20-cap group with one member is not "95% a better
 * fit" than a 4-cap group with one member; both simply have room.
 *
 * No limit set means unknown, not ideal: the previous 1.0 meant an unconfigured
 * group outranked every group whose leader had actually set a limit.
 */
export function scoreCapacityDetailed(
  memberLimit: number | null,
  currentCount: number
): FactorScore {
  if (memberLimit === null) return unknown
  const openSlots = memberLimit - currentCount
  if (openSlots <= 0) return known(0.0)
  return known(0.4 + 0.6 * Math.min(1, openSlots / 3))
}

// ─── Plain scorers ────────────────────────────────────────────────────────────
// Score-only wrappers over the detailed versions above.

export function scoreLifeStage(
  candidateLifeStageId: string | null,
  groupLifeStageIds: string[]
): number {
  return scoreLifeStageDetailed(candidateLifeStageId, groupLifeStageIds).score
}

export function scoreGender(
  candidateGender: "Male" | "Female" | null,
  groupGenderFocus: "Male" | "Female" | "Mixed" | null
): number {
  return scoreGenderDetailed(candidateGender, groupGenderFocus).score
}

export function scoreLanguage(
  candidateLanguages: string[],
  groupLanguages: string[]
): number {
  return scoreLanguageDetailed(candidateLanguages, groupLanguages).score
}

export function scoreAge(
  candidateBirthMonth: number | null,
  candidateBirthYear: number | null,
  groupAgeRangeMin: number | null,
  groupAgeRangeMax: number | null
): number {
  return scoreAgeDetailed(
    candidateBirthMonth,
    candidateBirthYear,
    groupAgeRangeMin,
    groupAgeRangeMax
  ).score
}

export function scoreSchedule(
  candidateSlots: TimeSlot[],
  groupSlots: TimeSlot[]
): number {
  return scoreScheduleDetailed(candidateSlots, groupSlots).score
}

export function scoreLocation(
  candidateWorkCity: string | null,
  groupLocationCity: string | null
): number {
  return scoreLocationDetailed(candidateWorkCity, groupLocationCity).score
}

export function scoreMode(
  candidatePref: "Online" | "Hybrid" | "InPerson" | null,
  groupFormat: "Online" | "Hybrid" | "InPerson" | null
): number {
  return scoreModeDetailed(candidatePref, groupFormat).score
}

export function scoreCareer(
  candidateIndustry: string | null,
  memberIndustries: string[]
): number {
  return scoreCareerDetailed(candidateIndustry, memberIndustries).score
}

export function scoreCapacity(
  memberLimit: number | null,
  currentCount: number
): number {
  return scoreCapacityDetailed(memberLimit, currentCount).score
}
