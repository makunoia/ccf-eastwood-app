"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { breakoutGroupSchema } from "@/lib/validations/breakout-group"
import type { BreakoutGroupFormValues } from "@/lib/validations/breakout-group"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// ─── Breakout Group CRUD ──────────────────────────────────────────────────────

export async function createBreakoutGroup(
  eventId: string,
  data: BreakoutGroupFormValues
): Promise<ActionResult<{ id: string }>> {
  const parsed = breakoutGroupSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const { name, facilitatorId, coFacilitatorId, memberLimit, ...profile } = parsed.data
  try {
    const group = await db.breakoutGroup.create({
      data: {
        eventId,
        name,
        facilitatorId: facilitatorId ?? null,
        coFacilitatorId: coFacilitatorId ?? null,
        memberLimit: memberLimit ?? null,
        lifeStageId: profile.lifeStageId ?? null,
        genderFocus: profile.genderFocus ?? null,
        language: profile.language ?? null,
        ageRangeMin: profile.ageRangeMin ?? null,
        ageRangeMax: profile.ageRangeMax ?? null,
        meetingFormat: profile.meetingFormat ?? null,
        locationCity: profile.locationCity ?? null,
      },
      select: { id: true },
    })
    revalidatePath(`/events/${eventId}`)
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
  const { name, facilitatorId, coFacilitatorId, memberLimit, ...profile } = parsed.data
  try {
    await db.breakoutGroup.update({
      where: { id: groupId },
      data: {
        name,
        facilitatorId: facilitatorId ?? null,
        coFacilitatorId: coFacilitatorId ?? null,
        memberLimit: memberLimit ?? null,
        lifeStageId: profile.lifeStageId ?? null,
        genderFocus: profile.genderFocus ?? null,
        language: profile.language ?? null,
        ageRangeMin: profile.ageRangeMin ?? null,
        ageRangeMax: profile.ageRangeMax ?? null,
        meetingFormat: profile.meetingFormat ?? null,
        locationCity: profile.locationCity ?? null,
      },
    })
    revalidatePath(`/events/${eventId}`)
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
    revalidatePath(`/events/${eventId}`)
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
    revalidatePath(`/events/${eventId}`)
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
    revalidatePath(`/events/${eventId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to remove registrant from breakout group" }
  }
}

// ─── Facilitator assignment ───────────────────────────────────────────────────

export async function setFacilitator(
  groupId: string,
  volunteerId: string | null,
  role: "facilitator" | "coFacilitator",
  eventId: string
): Promise<ActionResult> {
  // Validate the volunteer belongs to this event (if assigning, not clearing)
  if (volunteerId !== null) {
    const volunteer = await db.volunteer.findFirst({
      where: { id: volunteerId, eventId },
      select: { id: true },
    })
    if (!volunteer) {
      return { success: false, error: "Volunteer not found for this event" }
    }
    // Prevent the same volunteer in both facilitator slots
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
  try {
    await db.breakoutGroup.update({
      where: { id: groupId },
      data: role === "facilitator"
        ? { facilitatorId: volunteerId }
        : { coFacilitatorId: volunteerId },
    })
    revalidatePath(`/events/${eventId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update facilitator" }
  }
}
