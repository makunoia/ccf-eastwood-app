import type { Gender, Prisma } from "@/app/generated/prisma/client"

/**
 * Fill-if-empty backfill for a household member's Guest profile.
 *
 * A household member is matched by name within their own family rather than
 * created fresh, because a child typically has no contact details to dedup on.
 * That match is why this exists: without it, whatever the family answered on
 * the CREATE path was the only thing ever stored, and every later registration
 * silently discarded the answers — a household member first added without a
 * gender could never gain one.
 *
 * **Fill only what is empty; never overwrite.** Same rule as the primary
 * registrant's resolvers in `lib/events/registration-core.ts`. A value already
 * on file may have been curated by an admin, so a spelling typed at a
 * registration desk must not replace it.
 *
 * Pure, and shared by both household write paths (`createHouseholdRegistration`
 * and `addHouseholdMemberAtCheckin`) so the registration form and the check-in
 * desk cannot drift apart on which fields a profile gains — that asymmetry was
 * the original bug.
 *
 * Callers must pass a payload already run through `sanitizeHouseholdMember`, so
 * a field the event's form config disables arrives null and is never written.
 */

/** The stored side — what the matched Guest already holds. */
export type HouseholdBackfillTarget = {
  nickname?: string | null
  gender?: Gender | null
  birthMonth?: number | null
  birthYear?: number | null
  ageRangeBucketId?: string | null
} | null

/** The answered side — the sanitized household member payload. */
export type HouseholdBackfillInput = {
  nickname?: string | null
  gender?: Gender | null
  birthMonth?: number | null
  birthYear?: number | null
  ageRangeBucketId?: string | null
}

/**
 * The Prisma `data` for a Guest update — only the fields worth writing. Typed
 * as the scalar (unchecked) shape, since `ageRangeBucketId` is the FK column
 * rather than the relation.
 */
export type HouseholdBackfill = Pick<
  Prisma.GuestUncheckedUpdateInput,
  "nickname" | "gender" | "birthMonth" | "birthYear" | "ageRangeBucketId"
>

export function householdBackfill(
  stored: HouseholdBackfillTarget,
  answered: HouseholdBackfillInput
): HouseholdBackfill {
  return {
    ...(!stored?.nickname && answered.nickname ? { nickname: answered.nickname } : {}),
    ...(stored?.gender == null && answered.gender != null
      ? { gender: answered.gender }
      : {}),
    // Month and year are one answer on the form, so they move together: a guest
    // who already has a year keeps their month too, rather than having it
    // replaced from a payload whose year was ignored.
    ...(stored?.birthYear == null && answered.birthYear != null
      ? { birthYear: answered.birthYear, birthMonth: answered.birthMonth ?? null }
      : {}),
    ...(stored?.ageRangeBucketId == null && answered.ageRangeBucketId != null
      ? { ageRangeBucketId: answered.ageRangeBucketId }
      : {}),
  }
}
