"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { breakoutGroupSchema } from "@/lib/validations/breakout-group"
import type { BreakoutGroupFormValues } from "@/lib/validations/breakout-group"
import { matchBreakoutGroups } from "@/lib/matching"
import {
  tryCreateSmallGroupRequestFromBreakout,
  tryCancelSmallGroupRequestFromBreakout,
} from "@/lib/create-small-group-request"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// ─── Timothy profile validation ───────────────────────────────────────────────

/**
 * When a facilitator volunteer is a Timothy (has no led small groups),
 * the breakout group's matching profile must be filled in so that the system
 * has enough data to set up their future small group.
 */
async function validateTimothyProfile(
  facilitatorId: string | null | undefined,
  profile: {
    genderFocus?: string | null
    language?: string[]
    meetingFormat?: string | null
    schedule?: { dayOfWeek: number; timeStart: string } | null
  }
): Promise<string | null> {
  if (!facilitatorId) return null

  const volunteer = await db.volunteer.findUnique({
    where: { id: facilitatorId },
    select: { member: { select: { _count: { select: { ledGroups: true } } } } },
  })
  if (!volunteer) return null

  const isTimothy = volunteer.member._count.ledGroups === 0
  if (!isTimothy) return null

  const missing: string[] = []
  if (!profile.genderFocus) missing.push("Gender Focus")
  if (!profile.language || profile.language.length === 0) missing.push("Language")
  if (!profile.meetingFormat) missing.push("Meeting Format")
  if (!profile.schedule) missing.push("Meeting Schedule")

  if (missing.length > 0) {
    return `Timothy profile requires: ${missing.join(", ")}`
  }
  return null
}

// ─── Breakout Group CRUD ──────────────────────────────────────────────────────

export async function createBreakoutGroup(
  eventId: string,
  data: BreakoutGroupFormValues
): Promise<ActionResult<{ id: string }>> {
  const parsed = breakoutGroupSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const { name, facilitatorId, coFacilitatorId, memberLimit, linkedSmallGroupId, schedule, ...profile } = parsed.data

  const timothyError = await validateTimothyProfile(facilitatorId, { ...profile, schedule })
  if (timothyError) return { success: false, error: timothyError }

  try {
    const group = await db.breakoutGroup.create({
      data: {
        eventId,
        name,
        facilitatorId: facilitatorId ?? null,
        coFacilitatorId: coFacilitatorId ?? null,
        memberLimit: memberLimit ?? null,
        linkedSmallGroupId: linkedSmallGroupId ?? null,
        lifeStageId: profile.lifeStageId ?? null,
        genderFocus: profile.genderFocus ?? null,
        language: profile.language,
        ageRangeMin: profile.ageRangeMin ?? null,
        ageRangeMax: profile.ageRangeMax ?? null,
        meetingFormat: profile.meetingFormat ?? null,
        locationCity: profile.locationCity ?? null,
        ...(schedule
          ? {
              schedules: {
                create: {
                  dayOfWeek: schedule.dayOfWeek,
                  timeStart: schedule.timeStart,
                },
              },
            }
          : {}),
      },
      select: { id: true },
    })
    revalidatePath(`/event/${eventId}/breakouts`)
    return { success: true, data: { id: group.id } }
  } catch {
    return { success: false, error: "Failed to create breakout group" }
  }
}

export async function updateBreakoutGroup(
  groupId: string,
  eventId: string,
  data: BreakoutGroupFormValues
): Promise<ActionResult> {
  const parsed = breakoutGroupSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const { name, facilitatorId, coFacilitatorId, memberLimit, linkedSmallGroupId, schedule, ...profile } = parsed.data

  const timothyError = await validateTimothyProfile(facilitatorId, { ...profile, schedule })
  if (timothyError) return { success: false, error: timothyError }

  try {
    await db.breakoutGroup.update({
      where: { id: groupId },
      data: {
        name,
        facilitatorId: facilitatorId ?? null,
        coFacilitatorId: coFacilitatorId ?? null,
        memberLimit: memberLimit ?? null,
        linkedSmallGroupId: linkedSmallGroupId ?? null,
        lifeStageId: profile.lifeStageId ?? null,
        genderFocus: profile.genderFocus ?? null,
        language: profile.language,
        ageRangeMin: profile.ageRangeMin ?? null,
        ageRangeMax: profile.ageRangeMax ?? null,
        meetingFormat: profile.meetingFormat ?? null,
        locationCity: profile.locationCity ?? null,
        schedules: {
          deleteMany: {},
          ...(schedule
            ? {
                create: {
                  dayOfWeek: schedule.dayOfWeek,
                  timeStart: schedule.timeStart,
                },
              }
            : {}),
        },
      },
    })
    revalidatePath(`/event/${eventId}/breakouts`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update breakout group" }
  }
}

export async function deleteBreakoutGroup(
  groupId: string,
  eventId: string
): Promise<ActionResult> {
  try {
    await db.breakoutGroup.delete({ where: { id: groupId } })
    revalidatePath(`/event/${eventId}/breakouts`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete breakout group" }
  }
}

// ─── Registrant assignment ────────────────────────────────────────────────────

export async function addRegistrantToBreakout(
  groupId: string,
  registrantId: string,
  eventId: string
): Promise<ActionResult> {
  try {
    const registrant = await db.eventRegistrant.findUnique({
      where: { id: registrantId },
      select: { memberId: true },
    })
    if (registrant?.memberId) {
      const isFacilitator = await db.breakoutGroup.findFirst({
        where: {
          eventId,
          OR: [
            { facilitator: { memberId: registrant.memberId } },
            { coFacilitator: { memberId: registrant.memberId } },
          ],
        },
        select: { id: true },
      })
      if (isFacilitator) {
        return {
          success: false,
          error: "Facilitators and co-facilitators cannot be added as breakout group members",
        }
      }
    }

    const group = await db.breakoutGroup.findUnique({
      where: { id: groupId },
      select: {
        memberLimit: true,
        _count: { select: { members: true } },
      },
    })
    if (!group) return { success: false, error: "Breakout group not found" }
    if (group.memberLimit !== null && group._count.members >= group.memberLimit) {
      return {
        success: false,
        error: `Group has reached its limit of ${group.memberLimit}`,
      }
    }
    await db.breakoutGroupMember.create({ data: { breakoutGroupId: groupId, registrantId } })
    await tryCreateSmallGroupRequestFromBreakout(groupId, registrantId)
    revalidatePath(`/event/${eventId}/breakouts`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to add registrant to breakout group" }
  }
}

export async function removeRegistrantFromBreakout(
  groupId: string,
  registrantId: string,
  eventId: string
): Promise<ActionResult> {
  try {
    await db.breakoutGroupMember.delete({
      where: { breakoutGroupId_registrantId: { breakoutGroupId: groupId, registrantId } },
    })
    await tryCancelSmallGroupRequestFromBreakout(groupId, registrantId)
    revalidatePath(`/event/${eventId}/breakouts`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to remove registrant from breakout group" }
  }
}

// ─── Facilitator assignment ───────────────────────────────────────────────────

// ─── Auto-assign on check-in ─────────────────────────────────────────────────

/**
 * Called after a registrant checks in to an occurrence.
 * Silently assigns them to the best-matching breakout group if they're not
 * already assigned to one. Never throws — failures are swallowed so they
 * never block the check-in flow.
 */
export async function autoAssignRegistrantToBreakout(
  registrantId: string,
  eventId: string
): Promise<void> {
  try {
    const alreadyAssigned = await db.breakoutGroupMember.findFirst({
      where: { registrantId, breakoutGroup: { eventId } },
      select: { breakoutGroupId: true },
    })
    if (alreadyAssigned) return

    const registrant = await db.eventRegistrant.findUnique({
      where: { id: registrantId },
      select: { memberId: true },
    })
    if (registrant?.memberId) {
      const isFacilitator = await db.breakoutGroup.findFirst({
        where: {
          eventId,
          OR: [
            { facilitator: { memberId: registrant.memberId } },
            { coFacilitator: { memberId: registrant.memberId } },
          ],
        },
        select: { id: true },
      })
      if (isFacilitator) return
    }

    const matches = await matchBreakoutGroups(registrantId, eventId, {
      excludeAssigned: true,
      limit: 1,
    })
    if (matches.length === 0) return

    const topMatch = matches[0]

    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: topMatch.groupId, registrantId },
    })
    await tryCreateSmallGroupRequestFromBreakout(topMatch.groupId, registrantId)

    revalidatePath(`/event/${eventId}/breakouts`)
  } catch {
    // Swallow — auto-assign is best-effort and must not interrupt check-in
  }
}

// ─── Auto-assign ─────────────────────────────────────────────────────────────

export async function autoAssignBreakouts(
  eventId: string
): Promise<ActionResult<{ assigned: number; skipped: number }>> {
  try {
    const unassigned = await db.eventRegistrant.findMany({
      where: {
        eventId,
        breakoutGroupMemberships: { none: {} },
        NOT: {
          member: {
            volunteers: {
              some: {
                OR: [
                  { facilitatedGroups: { some: { eventId } } },
                  { coFacilitatedGroups: { some: { eventId } } },
                ],
              },
            },
          },
        },
      },
      select: { id: true },
    })

    if (unassigned.length === 0) {
      return { success: true, data: { assigned: 0, skipped: 0 } }
    }

    let assigned = 0
    let skipped = 0

    for (const { id: registrantId } of unassigned) {
      const matches = await matchBreakoutGroups(registrantId, eventId, {
        excludeAssigned: true,
        limit: 1,
      })

      if (matches.length === 0) {
        skipped++
        continue
      }

      await db.breakoutGroupMember.create({
        data: { breakoutGroupId: matches[0].groupId, registrantId },
      })
      await tryCreateSmallGroupRequestFromBreakout(matches[0].groupId, registrantId)
      assigned++
    }

    revalidatePath(`/event/${eventId}/breakouts`)
    return { success: true, data: { assigned, skipped } }
  } catch {
    return { success: false, error: "Failed to auto-assign registrants" }
  }
}

// ─── Facilitator assignment ───────────────────────────────────────────────────

export async function setFacilitator(
  groupId: string,
  volunteerId: string | null,
  role: "facilitator" | "coFacilitator",
  eventId: string,
  linkedSmallGroupId?: string | null
): Promise<ActionResult> {
  try {
    if (volunteerId !== null) {
      const volunteer = await db.volunteer.findFirst({
        where: { id: volunteerId, eventId },
        select: { id: true },
      })
      if (!volunteer) {
        return { success: false, error: "Volunteer not found for this event" }
      }
      const group = await db.breakoutGroup.findUnique({
        where: { id: groupId },
        select: { facilitatorId: true, coFacilitatorId: true },
      })
      if (!group) return { success: false, error: "Breakout group not found" }
      const otherSlot = role === "facilitator" ? group.coFacilitatorId : group.facilitatorId
      if (otherSlot === volunteerId) {
        return {
          success: false,
          error: "Facilitator and co-facilitator must be different volunteers",
        }
      }
    }
    await db.breakoutGroup.update({
      where: { id: groupId },
      data: role === "facilitator"
        ? {
            facilitatorId: volunteerId,
            ...(linkedSmallGroupId !== undefined ? { linkedSmallGroupId } : {}),
          }
        : { coFacilitatorId: volunteerId },
    })
    revalidatePath(`/event/${eventId}/breakouts/${groupId}`)
    revalidatePath(`/event/${eventId}/breakouts`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update facilitator" }
  }
}
