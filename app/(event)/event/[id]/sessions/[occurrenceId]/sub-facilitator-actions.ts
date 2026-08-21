"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { resolvePoolScope } from "@/lib/events/pool-scope"
import { requireBreakoutWrite } from "@/lib/events/require-event-write"
import { isClusterOwner, type BreakoutOwner } from "@/lib/breakouts/owner"
import { FacilitatorRole } from "@/app/generated/prisma/client"

type ActionResult = { success: true } | { success: false; error: string }

/**
 * Standing in for a table's facilitator at one sitting.
 *
 * `OccurrenceSubFacilitator` is keyed by `[occurrenceId, breakoutGroupId, role]`
 * and carries no event of its own, so the row could always name a cluster-owned
 * table. What could not was the screen that writes it: the session page listed
 * tables with a bare `eventId`, so on a Collab day it offered the member event's
 * standing tables — untouched and unused for the day — and none of the day's own.
 * Both sides now resolve the owner through `resolvePoolScope`.
 *
 * These two actions also had **no guard of any kind**: no `auth()`, no
 * permission check, and no verification that the three caller-supplied ids
 * belonged together. A server action is a POST endpoint that carries its own
 * arguments, so anyone who could reach it could staff any table of any event
 * with any volunteer. Their sibling `attendee-actions.ts` says exactly this in
 * its own comment; this file simply never followed it.
 */

/** The occurrence, the day's table owner, and who may staff those tables. */
async function resolveSessionScope(occurrenceId: string) {
  const occurrence = await db.eventOccurrence.findUnique({
    where: { id: occurrenceId },
    select: { id: true, eventId: true },
  })
  if (!occurrence) return null
  const scope = await resolvePoolScope(occurrence.eventId)
  return { occurrence, scope }
}

/**
 * Refuse a table that isn't the day's.
 *
 * The owner comparison is the same one `pickedIsInPlay` makes on the public
 * pickers: a table from another event, or from another day, is not made eligible
 * by naming this occurrence alongside it.
 */
async function groupIsInPlay(breakoutGroupId: string, owner: BreakoutOwner) {
  const group = await db.breakoutGroup.findFirst({
    where: { id: breakoutGroupId, ...owner },
    select: { id: true },
  })
  return group !== null
}

export async function assignSubFacilitator(
  occurrenceId: string,
  breakoutGroupId: string,
  role: FacilitatorRole,
  substituteId: string,
): Promise<ActionResult> {
  try {
    const resolved = await resolveSessionScope(occurrenceId)
    if (!resolved) return { success: false, error: "Occurrence not found." }
    const { occurrence, scope } = resolved

    const denied = await requireBreakoutWrite(scope.breakoutOwner)
    if (denied) return { success: false, error: denied.error }

    if (!(await groupIsInPlay(breakoutGroupId, scope.breakoutOwner))) {
      return { success: false, error: "That breakout group isn't part of this session." }
    }

    // A substitute comes from the roster that staffs these tables — one event's
    // under an ordinary event, either ministry's under a Collab, since a
    // cluster-owned table can be staffed from either.
    const substitute = await db.volunteer.findFirst({
      where: { id: substituteId, eventId: { in: scope.volunteerEventIds } },
      select: { id: true },
    })
    if (!substitute) {
      return { success: false, error: "That volunteer isn't serving on this day." }
    }

    await db.occurrenceSubFacilitator.upsert({
      where: { occurrenceId_breakoutGroupId_role: { occurrenceId, breakoutGroupId, role } },
      create: { occurrenceId, breakoutGroupId, role, substituteId },
      update: { substituteId },
    })

    revalidateSessionSurfaces(occurrence.eventId, occurrenceId, scope.breakoutOwner)
    return { success: true }
  } catch {
    return { success: false, error: "Failed to assign sub-facilitator." }
  }
}

/**
 * The event id is no longer a parameter: it was caller-supplied and used only to
 * build the revalidate path, which meant an argument nobody checked could aim a
 * cache invalidation at any event. It is derived from the occurrence instead.
 */
export async function removeSubFacilitator(
  occurrenceId: string,
  breakoutGroupId: string,
  role: FacilitatorRole,
): Promise<ActionResult> {
  try {
    const resolved = await resolveSessionScope(occurrenceId)
    if (!resolved) return { success: false, error: "Occurrence not found." }
    const { occurrence, scope } = resolved

    const denied = await requireBreakoutWrite(scope.breakoutOwner)
    if (denied) return { success: false, error: denied.error }

    if (!(await groupIsInPlay(breakoutGroupId, scope.breakoutOwner))) {
      return { success: false, error: "That breakout group isn't part of this session." }
    }

    await db.occurrenceSubFacilitator.deleteMany({
      where: { occurrenceId, breakoutGroupId, role },
    })

    revalidateSessionSurfaces(occurrence.eventId, occurrenceId, scope.breakoutOwner)
    return { success: true }
  } catch {
    return { success: false, error: "Failed to remove sub-facilitator." }
  }
}

/**
 * The session screen is where the change shows, but a cluster-owned table is
 * also listed on the day's own Breakouts page — and Catch Mech reads
 * `subFacilitators` to decide who may answer for a table.
 */
function revalidateSessionSurfaces(
  eventId: string,
  occurrenceId: string,
  owner: BreakoutOwner,
) {
  revalidatePath(`/event/${eventId}/sessions/${occurrenceId}`)
  revalidatePath(`/event/${eventId}/catch-mech`)
  if (isClusterOwner(owner)) revalidatePath(`/cluster/${owner.clusterId}/breakouts`)
  else revalidatePath(`/event/${eventId}/breakouts`)
}
