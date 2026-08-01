import type { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { buildStoredScheduleSlot } from "@/lib/matching/candidate-schedule"
import {
  SCHEDULE_KEYS,
  SHARED_PROFILE_KEYS,
  type MatchingProfileInput,
} from "@/lib/validations/matching-profile"

/**
 * Writes a person's matching profile — the storage half of `matchingProfileSchema`.
 *
 * **Only columns the caller actually sent are written.** Callers know different
 * subsets of the profile (the guest detail page omits birth month/year, the
 * catch-mech match section additionally omits gender and the schedule), so
 * writing every column unconditionally silently erased whatever the caller
 * didn't know about. An explicitly-sent `null` still clears the column, so a
 * caller that means to clear a field is unaffected. Absent key = leave alone.
 *
 * Guests and members answer the same questions but store availability
 * differently: a guest keeps a single inline slot in scalar columns, a member
 * owns `SchedulePreference` rows. That difference is the only reason there are
 * two functions here.
 */

/** True when the caller sent at least one of the schedule keys. */
function sentSchedule(parsed: MatchingProfileInput): boolean {
  return SCHEDULE_KEYS.some((k) => k in parsed)
}

function sharedUpdates(parsed: MatchingProfileInput): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const key of SHARED_PROFILE_KEYS) {
    // Zod strips absent optional keys, so `in` distinguishes "not sent" from
    // "sent as null".
    if (!(key in parsed)) continue
    if (key === "language") {
      data.language = parsed.language ?? []
    } else {
      // Every other profile column is nullable.
      data[key] = parsed[key] ?? null
    }
  }
  return data
}

export async function applyGuestMatchingProfile(
  guestId: string,
  parsed: MatchingProfileInput
): Promise<void> {
  const data = sharedUpdates(parsed) as Prisma.GuestUpdateInput
  for (const key of SCHEDULE_KEYS) {
    if (!(key in parsed)) continue
    ;(data as Record<string, unknown>)[key] = parsed[key] ?? null
  }
  await db.guest.update({ where: { id: guestId }, data })
}

export async function applyMemberMatchingProfile(
  memberId: string,
  parsed: MatchingProfileInput
): Promise<void> {
  const data = sharedUpdates(parsed) as Prisma.MemberUpdateInput

  if (sentSchedule(parsed)) {
    // The forms that write a profile collect one availability slot, so a sent
    // schedule replaces the member's stored preferences rather than adding to
    // them. A day-only answer ("Tuesdays, any time") is still a real preference
    // — `buildStoredScheduleSlot` widens it into a whole-day slot instead of
    // dropping it. A sent-null day clears the schedule outright.
    const slot = buildStoredScheduleSlot(
      parsed.scheduleDayOfWeek,
      parsed.scheduleTimeStart,
      parsed.scheduleTimeEnd
    )
    data.schedulePreferences = {
      deleteMany: {},
      ...(slot && {
        create: {
          dayOfWeek: slot.dayOfWeek,
          timeStart: slot.timeStart,
          timeEnd: slot.timeEnd,
        },
      }),
    }
  }

  if (Object.keys(data).length === 0) return
  await db.member.update({ where: { id: memberId }, data })
}
