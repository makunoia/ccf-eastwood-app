import { z } from "zod"

/**
 * Birth month/year field validation, shared by every surface that collects a
 * birthday (public registration, household members, the matching profile, the
 * assistant's write tools).
 *
 * These messages are shown verbatim to the person filling in a public form —
 * `createRegistrant` and friends return `error.issues[0].message` straight to
 * the client — so Zod's default ("Too small: expected number to be >=1900") is
 * not acceptable here. The message has to say what a good value looks like.
 *
 * The bounds mostly catch typos rather than real people: `YearInput` accepts
 * digits as they are typed, so a half-typed "19" can be submitted, and a
 * fat-fingered "1089" or a year in the future is never a real birthday.
 */

/** Oldest birth year we accept — beyond this it is a typo, not a registrant. */
export const MIN_BIRTH_YEAR = 1900

export function birthYearMessage(now: Date = new Date()): string {
  return `Please enter a 4-digit birth year between ${MIN_BIRTH_YEAR} and ${now.getFullYear()}.`
}

export const BIRTH_MONTH_MESSAGE = "Please select a valid birth month."

/** A year is valid when it is a whole number inside the plausible window. */
export function isValidBirthYear(year: number, now: Date = new Date()): boolean {
  return Number.isInteger(year) && year >= MIN_BIRTH_YEAR && year <= now.getFullYear()
}

export const birthMonthSchema = z
  .number(BIRTH_MONTH_MESSAGE)
  .int(BIRTH_MONTH_MESSAGE)
  .min(1, BIRTH_MONTH_MESSAGE)
  .max(12, BIRTH_MONTH_MESSAGE)

export const birthYearSchema = z
  .number({ error: () => birthYearMessage() })
  // One refinement rather than .int()/.min()/.max(): every way of getting the
  // year wrong deserves the same sentence, and the upper bound has to be read
  // at parse time so the message doesn't go stale on New Year's Day.
  .refine((y) => isValidBirthYear(y), { error: () => birthYearMessage() })

/** The optional+nullable form used by every form payload. */
export const optionalBirthMonth = birthMonthSchema.optional().nullable()
export const optionalBirthYear = birthYearSchema.optional().nullable()
