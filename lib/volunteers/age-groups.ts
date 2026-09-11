/** Stable assignment-profile ranges. Values are stored as labels so they remain
 * readable in exports and can be used directly by the breakout filter. */
export const VOLUNTEER_AGE_GROUPS = [
  "Under 18",
  "18–24",
  "25–34",
  "35–49",
  "50–64",
  "65+",
] as const

export type VolunteerAgeGroup = (typeof VOLUNTEER_AGE_GROUPS)[number]

export function ageGroupForBirthDate(
  birthYear: number | null | undefined,
  birthMonth: number | null | undefined,
  now: Date = new Date()
): VolunteerAgeGroup | null {
  if (birthYear == null) return null
  const birthdayHasPassed = birthMonth == null || now.getUTCMonth() + 1 >= birthMonth
  const age = now.getUTCFullYear() - birthYear - (birthdayHasPassed ? 0 : 1)
  if (age <= 17) return "Under 18"
  if (age <= 24) return "18–24"
  if (age <= 34) return "25–34"
  if (age <= 49) return "35–49"
  if (age <= 64) return "50–64"
  return "65+"
}

/** @deprecated Pass a birth month to {@link ageGroupForBirthDate} when known. */
export function ageGroupForBirthYear(birthYear: number | null | undefined, now?: Date) {
  return ageGroupForBirthDate(birthYear, null, now)
}
