"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import { runBatchDelete } from "@/lib/batch"
import { VolunteerStatus } from "@/app/generated/prisma/client"
import type { BatchDeleteResult } from "@/components/batch/types"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

async function requireWrite(): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canWrite(session, "Events")) return { error: "Unauthorized." }
  return null
}

const VALID_STATUSES = new Set<string>(Object.values(VolunteerStatus))

export async function setVolunteersStatusBatch(
  eventId: string,
  ids: string[],
  status: string
): Promise<ActionResult<{ updated: number }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (ids.length === 0) return { success: true, data: { updated: 0 } }
  if (!VALID_STATUSES.has(status)) {
    return { success: false, error: "Invalid status." }
  }

  try {
    // Scope to this event so a stale/foreign id can never be mutated.
    const result = await db.volunteer.updateMany({
      where: { id: { in: ids }, eventId },
      data: { status: status as VolunteerStatus },
    })
    revalidatePath(`/event/${eventId}/volunteers`)
    revalidatePath("/volunteers")
    return { success: true, data: { updated: result.count } }
  } catch {
    return { success: false, error: "Failed to update status" }
  }
}

export async function deleteVolunteersBatch(
  eventId: string,
  ids: string[]
): Promise<ActionResult<BatchDeleteResult>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (ids.length === 0) return { success: true, data: { deleted: 0, failed: [] } }

  try {
    const volunteers = await db.volunteer.findMany({
      where: { id: { in: ids }, eventId },
      select: { id: true, member: { select: { firstName: true, lastName: true } } },
    })
    const names = new Map(
      volunteers.map((v) => [v.id, `${v.member.firstName} ${v.member.lastName}`])
    )

    const result = await runBatchDelete({
      ids,
      names,
      deleteOne: (id) =>
        db.volunteer
          .delete({ where: { id } })
          .then(() => undefined),
      fkReason: "is facilitating a breakout group",
    })

    revalidatePath(`/event/${eventId}/volunteers`)
    revalidatePath("/volunteers")
    return { success: true, data: result }
  } catch {
    return { success: false, error: "Failed to remove volunteers" }
  }
}
