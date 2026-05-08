"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { updateVolunteerSchema } from "@/lib/validations/volunteer"

type ActionResult<T = void> = { success: true; data: T } | { success: false; error: string }

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
  const parsed = updateVolunteerSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const { memberId, committeeId, preferredRoleId, assignedRoleId, status, notes } = parsed.data

  try {
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
  try {
    await db.volunteer.delete({ where: { id: volunteerId } })
    revalidatePath(`/event/${eventId}/volunteers`)
    revalidatePath("/volunteers")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete volunteer" }
  }
}
