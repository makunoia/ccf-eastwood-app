"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import { runBatchDelete } from "@/lib/batch"
import type { ActionResult, BatchDeleteResult } from "@/components/batch/types"

async function requireWrite(): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canWrite(session, "Events")) return { error: "Unauthorized." }
  return null
}

function registrantName(r: {
  member: { firstName: string; lastName: string } | null
  guest: { firstName: string; lastName: string } | null
  firstName: string | null
  lastName: string | null
}): string {
  if (r.member) return `${r.member.firstName} ${r.member.lastName}`
  if (r.guest) return `${r.guest.firstName} ${r.guest.lastName}`
  return `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "Unknown"
}

export async function deleteRegistrantsBatch(
  eventId: string,
  ids: string[]
): Promise<ActionResult<BatchDeleteResult>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (ids.length === 0) return { success: true, data: { deleted: 0, failed: [] } }

  try {
    // Scope to this event so a stale/foreign id can never be deleted.
    const registrants = await db.eventRegistrant.findMany({
      where: { id: { in: ids }, eventId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        member: { select: { firstName: true, lastName: true } },
        guest: { select: { firstName: true, lastName: true } },
      },
    })
    const names = new Map(registrants.map((r) => [r.id, registrantName(r)]))
    const scopedIds = registrants.map((r) => r.id)

    const result = await runBatchDelete({
      ids: scopedIds,
      names,
      deleteOne: (id) => db.eventRegistrant.delete({ where: { id } }).then(() => undefined),
      fkReason: "has related check-in, breakout, or bus records",
    })

    revalidatePath(`/event/${eventId}/registrants`)
    return { success: true, data: result }
  } catch {
    return { success: false, error: "Failed to remove registrants" }
  }
}

/**
 * Bulk mark/unmark attendance for OneTime events. MultiDay and Recurring track
 * attendance per occurrence, so this is gated to OneTime in the UI.
 */
export async function setRegistrantsAttendanceBatch(
  eventId: string,
  ids: string[],
  attended: boolean
): Promise<ActionResult<{ updated: number }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (ids.length === 0) return { success: true, data: { updated: 0 } }

  try {
    const result = await db.eventRegistrant.updateMany({
      where: { id: { in: ids }, eventId },
      data: { attendedAt: attended ? new Date() : null },
    })
    revalidatePath(`/event/${eventId}/registrants`)
    return { success: true, data: { updated: result.count } }
  } catch {
    return { success: false, error: "Failed to update attendance" }
  }
}
