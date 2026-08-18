"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { requireEventWrite } from "@/lib/events/require-event-write"
import { updateVolunteerSchema } from "@/lib/validations/volunteer"

type ActionResult<T = void> = { success: true; data: T } | { success: false; error: string }

type CreateInput = {
  eventId: string
  memberId: string
  committeeId: string
  preferredRoleId: string
  notes: string
}

export async function createEventVolunteer(
  raw: CreateInput
): Promise<ActionResult<{ id: string }>> {
  // Checks the *argument* event, not just the Events feature — see
  // `requireEventWrite`.
  const authError = await requireEventWrite(raw.eventId)
  if (authError) return { success: false, error: authError.error }

  const { eventId, memberId, committeeId, preferredRoleId, notes } = raw

  if (!memberId || !eventId || !committeeId || !preferredRoleId) {
    return { success: false, error: "All required fields must be filled." }
  }

  const existing = await db.volunteer.findFirst({ where: { memberId, eventId } })
  if (existing) {
    return { success: false, error: "This member is already registered as a volunteer for this event" }
  }

  try {
    const volunteer = await db.volunteer.create({
      data: {
        memberId,
        eventId,
        committeeId,
        preferredRoleId,
        notes: notes || null,
        leaderApprovalToken: crypto.randomUUID(),
      },
      select: { id: true },
    })
    revalidatePath(`/event/${eventId}/volunteers`)
    revalidatePath("/volunteers")
    return { success: true, data: { id: volunteer.id } }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { success: false, error: "This member is already registered as a volunteer for this event" }
    }
    return { success: false, error: "Failed to create volunteer" }
  }
}

type UpdateInput = {
  memberId: string
  eventId: string
  committeeId: string
  preferredRoleId: string
  assignedRoleId: string
  status: "Pending" | "Confirmed" | "Rejected" | ""
  notes: string
}

export async function updateEventVolunteer(
  volunteerId: string,
  eventId: string,
  raw: UpdateInput
): Promise<ActionResult> {
  const authError = await requireEventWrite(eventId)
  if (authError) return { success: false, error: authError.error }

  const parsed = updateVolunteerSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const { memberId, committeeId, preferredRoleId, assignedRoleId, status, notes } = parsed.data

  try {
    // Scoped to the event so a foreign volunteer id can't be re-pointed into it.
    const existing = await db.volunteer.findFirst({
      where: { id: volunteerId, eventId },
      select: { id: true },
    })
    if (!existing) return { success: false, error: "Volunteer not found" }

    await db.volunteer.update({
      where: { id: volunteerId },
      data: {
        memberId,
        eventId,
        committeeId,
        preferredRoleId,
        assignedRoleId: assignedRoleId ?? null,
        status,
        notes: notes ?? null,
      },
    })
    revalidatePath(`/event/${eventId}/volunteers`)
    revalidatePath(`/event/${eventId}/volunteers/${volunteerId}`)
    revalidatePath("/volunteers")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update volunteer" }
  }
}

export async function deleteEventVolunteerById(
  volunteerId: string,
  eventId: string
): Promise<ActionResult> {
  const authError = await requireEventWrite(eventId)
  if (authError) return { success: false, error: authError.error }

  try {
    // deleteMany so the event scope is part of the write itself.
    const { count } = await db.volunteer.deleteMany({ where: { id: volunteerId, eventId } })
    if (count === 0) return { success: false, error: "Volunteer not found" }
    revalidatePath(`/event/${eventId}/volunteers`)
    revalidatePath("/volunteers")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete volunteer" }
  }
}
