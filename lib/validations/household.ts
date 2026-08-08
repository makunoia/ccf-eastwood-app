import { z } from "zod"
import { FAMILY_ROLES } from "./family"
import { optionalBirthMonth, optionalBirthYear } from "./birth-date"

/**
 * Household registration (CCF-122). One person fills the form and adds the rest
 * of their household; each becomes an `EventRegistrant`, all linked to one
 * `Family`.
 *
 * Household members carry only per-person facts. Contact details stay on the
 * primary registrant — a child typically has no mobile of their own, and
 * duplicating the parent's number onto every member would poison phone-based
 * dedup for everyone.
 */

/** Guards against a runaway form; also the DoS ceiling on a public endpoint. */
export const MAX_HOUSEHOLD_MEMBERS = 12

const optionalTrimmed = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v.trim()))

export const householdMemberSchema = z.object({
  firstName: z.string().min(1, "First name is required").trim(),
  lastName: z.string().min(1, "Last name is required").trim(),
  nickname: optionalTrimmed,
  role: z.enum(FAMILY_ROLES),
  birthMonth: optionalBirthMonth,
  birthYear: optionalBirthYear,
  gender: z.enum(["Male", "Female"]).optional().nullable(),
  ageRangeBucketId: optionalTrimmed,
})

export type HouseholdMemberInput = z.infer<typeof householdMemberSchema>

export const householdSchema = z.object({
  /** The primary registrant's own role in their household. */
  primaryRole: z.enum(FAMILY_ROLES),
  /** Everyone other than the primary. May be empty — a household of one is valid. */
  members: z
    .array(householdMemberSchema)
    .max(MAX_HOUSEHOLD_MEMBERS, `Up to ${MAX_HOUSEHOLD_MEMBERS} household members`)
    .default([]),
  /**
   * Optional explicit family name. Omitted → derived from the primary's last
   * name, since `Family.name` is required.
   */
  familyName: optionalTrimmed,
})

export type HouseholdInput = z.infer<typeof householdSchema>

export type HouseholdFormMember = {
  firstName: string
  lastName: string
  nickname: string
  role: (typeof FAMILY_ROLES)[number]
  birthMonth: string
  birthYear: string
  gender: string
  ageRangeBucketId: string
}

export const defaultHouseholdMember: HouseholdFormMember = {
  firstName: "",
  lastName: "",
  nickname: "",
  role: "Child",
  birthMonth: "",
  birthYear: "",
  gender: "",
  ageRangeBucketId: "",
}

/** "dela Cruz Family" — the auto-name for a household with no explicit name. */
export function deriveFamilyName(lastName: string): string {
  const trimmed = lastName.trim()
  return trimmed ? `${trimmed} Family` : "Family"
}
