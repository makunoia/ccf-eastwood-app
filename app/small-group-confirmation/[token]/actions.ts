"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  RESOLVABLE_REQUEST_SELECT,
  resolveMemberRequest,
} from "@/lib/small-groups/resolve-member-request"
import { clearUpwardSatelliteOnConfirm } from "@/lib/small-groups/upward-satellite"
import {
  BREAKOUT_OWNER_NAME_SELECT,
  breakoutOccasionName,
} from "@/lib/breakouts/owner"
import {
  recordConfirmationSubmission,
  submitterName,
  tallyDecisions,
} from "@/lib/catch-mech/submission-log"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

type Decision = {
  requestId: string
  status: "confirmed" | "pending" | "rejected"
  notes?: string
}

export async function submitMemberConfirmations(
  token: string,
  decisions: Decision[]
): Promise<ActionResult> {
  const group = await db.smallGroup.findUnique({
    where: { leaderConfirmationToken: token },
    select: {
      id: true,
      name: true,
      leaderId: true,
      status: true,
      leader: { select: { id: true, firstName: true, lastName: true } },
    },
  })
  if (!group) {
    return { success: false, error: "Confirmation link not found or has expired." }
  }

  if (!decisions.length) {
    return { success: false, error: "No decisions provided." }
  }

  try {
    const affectedGuestIds = new Set<string>()
    const affectedBreakoutGroupIds = new Set<string>()

    // Pre-fetch event names for requests linked to catch mech breakout groups
    const decisionIds = decisions.map((d) => d.requestId)
    const requestsWithBreakout = await db.smallGroupMemberRequest.findMany({
      where: { id: { in: decisionIds }, breakoutGroupId: { not: null } },
      select: { id: true, breakoutGroupId: true },
    })
    const breakoutGroupIds = [...new Set(requestsWithBreakout.map((r) => r.breakoutGroupId!))]
    const breakoutGroups = breakoutGroupIds.length > 0
      ? await db.breakoutGroup.findMany({
          where: { id: { in: breakoutGroupIds } },
          select: { id: true, ...BREAKOUT_OWNER_NAME_SELECT },
        })
      : []
    // The collab day's name stands in for the event when a cluster owns the
    // table (CCF-148).
    const eventNameByBreakoutId = new Map(
      breakoutGroups.map((bg) => [bg.id, breakoutOccasionName(bg)])
    )
    const eventNameByRequestId = new Map(
      requestsWithBreakout.map((r) => [r.id, eventNameByBreakoutId.get(r.breakoutGroupId!) ?? null])
    )

    await db.$transaction(async (tx) => {
      // Existing members confirmed into this group. A promoted guest is a brand
      // new Member who leads nothing, so only these can hold a satellite.
      const confirmedMemberIds: string[] = []

      for (const { requestId, status: decisionStatus, notes: decisionNotes } of decisions) {
        // "pending" means the leader deferred — leave the request untouched
        if (decisionStatus === "pending") continue

        const request = await tx.smallGroupMemberRequest.findUnique({
          where: { id: requestId },
          select: RESOLVABLE_REQUEST_SELECT,
        })
        if (!request) continue

        const eventName = eventNameByRequestId.get(request.id) ?? null
        const result = await resolveMemberRequest(tx, {
          request,
          group,
          decision: decisionStatus === "confirmed" ? "confirmed" : "rejected",
          actor: { memberId: group.leaderId, byLabel: "by the group leader" },
          notes: decisionNotes ?? null,
          contextSuffix:
            request.breakoutGroupId && eventName
              ? ` via Catch Mech Link of ${eventName}`
              : "",
        })
        if (result.outcome === "skipped") continue

        if (request.guestId) affectedGuestIds.add(request.guestId)
        if (request.breakoutGroupId) affectedBreakoutGroupIds.add(request.breakoutGroupId)
        if (result.outcome === "confirmed" && result.confirmedMemberId) {
          confirmedMemberIds.push(result.confirmedMemberId)
        }
      }

      // This is where a member-portal request finally lands, so it is where the
      // requester's declared satellite stops being true.
      await clearUpwardSatelliteOnConfirm(tx, confirmedMemberIds)

      // Always recorded, even when every decision was deferred or every request was
      // already resolved. Those submissions write nothing else, so without this row
      // "the leader answered and deferred" is indistinguishable from "never opened
      // the link" — which is the whole reason this log exists.
      await recordConfirmationSubmission(tx, {
        source: "SmallGroupLeader",
        smallGroupId: group.id,
        submittedByMemberId: group.leaderId,
        submittedByName: submitterName(group.leader),
        decisions,
        ...tallyDecisions(decisions),
      })
    })

    revalidatePath(`/small-groups`)
    revalidatePath(`/small-groups/${group.id}`)
    revalidatePath("/guests")
    for (const guestId of affectedGuestIds) {
      revalidatePath(`/guests/${guestId}`)
    }

    // If this leader was previously a Timothy facilitating breakout groups,
    // link those groups to this small group now that they've become a leader.
    // Only applies when the group actually has a leader.
    if (group.leaderId) {
      const updatedBreakouts = await db.breakoutGroup.findMany({
        where: {
          linkedSmallGroupId: null,
          OR: [
            { facilitator: { memberId: group.leaderId } },
            { coFacilitator: { memberId: group.leaderId } },
          ],
        },
        select: { id: true, eventId: true },
      })
      if (updatedBreakouts.length > 0) {
        await db.breakoutGroup.updateMany({
          where: { id: { in: updatedBreakouts.map((b) => b.id) } },
          data: { linkedSmallGroupId: group.id },
        })
        const eventIds = [...new Set(updatedBreakouts.map((b) => b.eventId))]
        for (const eventId of eventIds) {
          revalidatePath(`/event/${eventId}/breakouts`)
          revalidatePath(`/event/${eventId}/dashboard`)
        }
      }
    }

    // Revalidate catch-mech admin pages for any requests linked to a breakout group
    const requestIds = decisions.map((d) => d.requestId)
    const linked = await db.smallGroupMemberRequest.findMany({
      where: { id: { in: requestIds }, breakoutGroupId: { not: null } },
      select: { breakoutGroupId: true },
    })
    if (linked.length > 0) {
      const bgIds = [...new Set(linked.map((r) => r.breakoutGroupId!))]
      const breakoutGroups = await db.breakoutGroup.findMany({
        where: { id: { in: bgIds } },
        select: { eventId: true },
      })
      const eventIds = [...new Set(breakoutGroups.map((bg) => bg.eventId))]
      for (const eventId of eventIds) {
        revalidatePath(`/event/${eventId}/catch-mech`)
        revalidatePath(`/event/${eventId}/dashboard`)
      }
    }

    return { success: true, data: undefined }
  } catch (e) {
    console.error("[submitMemberConfirmations] error:", e)
    return { success: false, error: "Failed to submit confirmations. Please try again." }
  }
}
