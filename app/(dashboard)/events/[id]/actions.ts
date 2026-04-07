"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function deleteEventVolunteer(
  volunteerId: string,
  eventId: string
): Promise<ActionResult> {
  try {
    await db.volunteer.delete({ where: { id: volunteerId } })
    revalidatePath(`/events/${eventId}`)
    revalidatePath("/volunteers")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to remove volunteer" }
  }
}
