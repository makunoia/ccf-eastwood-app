"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { FacilitatorRole } from "@/app/generated/prisma/client"

export async function assignSubFacilitator(
  occurrenceId: string,
  breakoutGroupId: string,
  role: FacilitatorRole,
  substituteId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const occurrence = await db.eventOccurrence.findUnique({
      where: { id: occurrenceId },
      select: { eventId: true, event: { select: { id: true } } },
    })
    if (!occurrence) return { success: false, error: "Occurrence not found." }

    await db.occurrenceSubFacilitator.upsert({
      where: { occurrenceId_breakoutGroupId_role: { occurrenceId, breakoutGroupId, role } },
      create: { occurrenceId, breakoutGroupId, role, substituteId },
      update: { substituteId },
    })

    revalidatePath(`/event/${occurrence.eventId}/sessions/${occurrenceId}`)
    return { success: true }
  } catch {
    return { success: false, error: "Failed to assign sub-facilitator." }
  }
}

export async function removeSubFacilitator(
  occurrenceId: string,
  breakoutGroupId: string,
  role: FacilitatorRole,
  eventId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await db.occurrenceSubFacilitator.deleteMany({
      where: { occurrenceId, breakoutGroupId, role },
    })

    revalidatePath(`/event/${eventId}/sessions/${occurrenceId}`)
    return { success: true }
  } catch {
    return { success: false, error: "Failed to remove sub-facilitator." }
  }
}
