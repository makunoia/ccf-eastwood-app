import type { TimeSlot } from "./types"

const AGE_DECAY_YEARS = 10

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

export function scoreLifeStage(
  candidateLifeStageId: string | null,
  groupLifeStageId: string | null
): number {
  if (groupLifeStageId === null) return 0.5 // group accepts all
  if (candidateLifeStageId === null) return 0.5 // no data on candidate
  return candidateLifeStageId === groupLifeStageId ? 1.0 : 0.0
}

export function scoreGender(
  candidateGender: "Male" | "Female" | null,
  groupGenderFocus: "Male" | "Female" | "Mixed" | null
): number {
  if (groupGenderFocus === null || groupGenderFocus === "Mixed") return 1.0
  if (candidateGender === null) return 0.5
  return candidateGender === groupGenderFocus ? 1.0 : 0.0
}

export function scoreLanguage(
  candidateLanguage: string | null,
  groupLanguages: string[]
): number {
  if (groupLanguages.length === 0) return 0.5 // group has no language preference
  if (candidateLanguage === null) return 0.5
  return groupLanguages.includes(candidateLanguage) ? 1.0 : 0.0
}

export function scoreAge(
  candidateBirthDate: Date | null,
  groupAgeRangeMin: number | null,
  groupAgeRangeMax: number | null
): number {
  if (candidateBirthDate === null) return 0.5
  if (groupAgeRangeMin === null && groupAgeRangeMax === null) return 0.5

  const now = new Date()
  const age = Math.floor(
    (now.getTime() - candidateBirthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  )

  const min = groupAgeRangeMin ?? 0
  const max = groupAgeRangeMax ?? Infinity

  if (age >= min && age <= max) return 1.0

  const distance = age < min ? min - age : age - max
  return Math.max(0, 1 - distance / AGE_DECAY_YEARS)
}

export function scoreSchedule(
  candidateSlots: TimeSlot[],
  groupSlots: TimeSlot[]
): number {
  if (candidateSlots.length === 0 || groupSlots.length === 0) return 0.5

  const overlapping = groupSlots.filter((gs) =>
    candidateSlots.some((cs) => slotsOverlap(cs, gs))
  )
  return overlapping.length / groupSlots.length
}

export function scoreLocation(
  candidateWorkCity: string | null,
  groupLocationCity: string | null
): number {
  if (candidateWorkCity === null || groupLocationCity === null) return 0.5
  return candidateWorkCity === groupLocationCity ? 1.0 : 0.0
}

export function scoreMode(
  candidatePref: "Online" | "Hybrid" | "InPerson" | null,
  groupFormat: "Online" | "Hybrid" | "InPerson" | null
): number {
  if (candidatePref === null || groupFormat === null) return 0.5
  if (candidatePref === groupFormat) return 1.0
  if (candidatePref === "Hybrid" || groupFormat === "Hybrid") return 0.5
  return 0.0
}

export function scoreCareer(
  candidateIndustry: string | null,
  memberIndustries: string[]
): number {
  if (candidateIndustry === null) return 0.5
  if (memberIndustries.length === 0) return 0.5
  const matchCount = memberIndustries.filter((i) => i === candidateIndustry).length
  return matchCount / memberIndustries.length
}

export function scoreCapacity(
  memberLimit: number | null,
  currentCount: number
): number {
  if (memberLimit === null) return 1.0
  const openSlots = memberLimit - currentCount
  if (openSlots <= 0) return 0.0
  return openSlots / memberLimit
}
