import "server-only"

import { db } from "@/lib/db"
import {
  clearCheckinAttendance,
  recordCheckinAttendance,
  type CheckinSubjectKind,
} from "@/lib/events/checkin-lookup"
import { latestWalkInSession } from "@/lib/events/walk-in-session"
import {
  RESOLVABLE_REQUEST_SELECT,
  personNameOf,
  resolveMemberRequest,
} from "@/lib/small-groups/resolve-member-request"
import { clearUpwardSatelliteOnConfirm } from "@/lib/small-groups/upward-satellite"
import { actorCan, actorCanWriteEvent, type McpActor } from "./auth"

type Result =
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: string }

const fail = (error: string): Result => ({ success: false, error })

/** Record or undo attendance after proving every supplied ID belongs to one event. */
export async function setMcpEventAttendance(
  actor: McpActor,
  input: {
    eventId: string
    subjectKind: CheckinSubjectKind
    subjectId: string
    occurrenceId?: string | null
    attended: boolean
  },
): Promise<Result> {
  if (!actorCan(actor, "Events", "Write") || !actorCanWriteEvent(actor, input.eventId)) {
    return fail("You do not have write access to this event.")
  }
  if (input.subjectKind === "volunteer" && !actorCan(actor, "Volunteers", "Write")) {
    return fail("You do not have permission to update volunteer attendance.")
  }

  const [event, subject, occurrence] = await Promise.all([
    db.event.findUnique({ where: { id: input.eventId }, select: { id: true, type: true } }),
    input.subjectKind === "registrant"
      ? db.eventRegistrant.findFirst({ where: { id: input.subjectId, eventId: input.eventId }, select: { id: true } })
      : db.volunteer.findFirst({ where: { id: input.subjectId, eventId: input.eventId }, select: { id: true } }),
    input.occurrenceId
      ? db.eventOccurrence.findFirst({ where: { id: input.occurrenceId, eventId: input.eventId }, select: { id: true } })
      : null,
  ])
  if (!event) return fail("Event not found.")
  if (!subject) return fail(`${input.subjectKind === "registrant" ? "Registrant" : "Volunteer"} not found in this event.`)
  if (input.occurrenceId && !occurrence) return fail("Session not found in this event.")
  if (event.type === "OneTime" && input.occurrenceId) return fail("One-time events do not use sessions.")
  if (event.type !== "OneTime" && !input.occurrenceId) return fail("Choose a session for a multi-day or recurring event.")

  const subjectRef = { kind: input.subjectKind, id: input.subjectId }
  try {
    if (input.attended) await recordCheckinAttendance(subjectRef, input.occurrenceId ?? null)
    else await clearCheckinAttendance(subjectRef, input.occurrenceId ?? null)
    return {
      success: true,
      data: {
        eventId: input.eventId,
        occurrenceId: input.occurrenceId ?? null,
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        attended: input.attended,
      },
    }
  } catch {
    return fail("Failed to update attendance.")
  }
}

/** Open/close a session and keep the public walk-in target consistent with the app. */
export async function setMcpOccurrenceCheckinOpen(
  actor: McpActor,
  occurrenceId: string,
  isOpen: boolean,
): Promise<Result> {
  const occurrence = await db.eventOccurrence.findUnique({
    where: { id: occurrenceId },
    select: { id: true, eventId: true, event: { select: { walkInSessionMode: true } } },
  })
  if (!occurrence) return fail("Session not found.")
  if (!actorCan(actor, "Events", "Write") || !actorCanWriteEvent(actor, occurrence.eventId)) {
    return fail("You do not have write access to this event.")
  }

  try {
    let walkInChanged = true
    await db.$transaction(async (tx) => {
      await tx.eventOccurrence.update({ where: { id: occurrenceId }, data: { isOpen } })
      if (occurrence.event.walkInSessionMode === "Latest") {
        // Resolved after the transaction below; Latest has no stored pointer to move.
        return
      }
      if (isOpen) {
        await tx.event.update({ where: { id: occurrence.eventId }, data: { walkInOccurrenceId: occurrenceId } })
      } else {
        const cleared = await tx.event.updateMany({
          where: { id: occurrence.eventId, walkInOccurrenceId: occurrenceId },
          data: { walkInOccurrenceId: null },
        })
        walkInChanged = cleared.count > 0
      }
    })
    if (occurrence.event.walkInSessionMode === "Latest") {
      const latest = await latestWalkInSession(occurrence.eventId)
      walkInChanged = latest?.id === occurrenceId
    }
    return { success: true, data: { occurrenceId, eventId: occurrence.eventId, isOpen, walkInChanged } }
  } catch {
    return fail("Failed to update session check-in.")
  }
}

/** Resolve one group-targeted membership request using the app's shared invariant logic. */
export async function resolveMcpDGroupRequest(
  actor: McpActor,
  requestId: string,
  decision: "approve" | "deny",
  notes?: string | null,
): Promise<Result> {
  if (!actorCan(actor, "SmallGroups", "Write")) {
    return fail("You do not have permission to resolve DGroup requests.")
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const request = await tx.smallGroupMemberRequest.findUnique({
        where: { id: requestId },
        select: {
          ...RESOLVABLE_REQUEST_SELECT,
          smallGroup: { select: { id: true, name: true, status: true, leaderId: true } },
        },
      })
      if (!request) return { error: "DGroup request not found." } as const
      if (!request.smallGroup) {
        if (decision === "approve") {
          return { error: "This is an unassigned DGroup request. Assign it to a DGroup before approving it." } as const
        }
        if (request.status !== "Pending") {
          return { error: "This request has already been resolved." } as const
        }
        await tx.smallGroupMemberRequest.update({
          where: { id: request.id },
          data: { status: "Rejected", resolvedAt: new Date(), notes },
        })
        return {
          requestId,
          personName: personNameOf(request),
          groupId: null,
          groupName: null,
          outcome: { outcome: "rejected" as const },
        }
      }
      if (decision === "approve" && request.guestId && (!actorCan(actor, "Guests", "Write") || !actorCan(actor, "Members", "Write"))) {
        return { error: "Guest and Member write permission are required to approve this request." } as const
      }
      if (decision === "approve" && request.memberId && !actorCan(actor, "Members", "Write")) {
        return { error: "Member write permission is required to approve this request." } as const
      }

      const outcome = await resolveMemberRequest(tx, {
        request,
        group: request.smallGroup,
        decision: decision === "approve" ? "confirmed" : "rejected",
        actor: { userId: actor.id, byLabel: "through the Churchie ChatGPT plugin" },
        notes,
      })
      if (outcome.outcome === "confirmed" && outcome.confirmedMemberId) {
        await clearUpwardSatelliteOnConfirm(tx, [outcome.confirmedMemberId])
      }
      return {
        requestId,
        personName: personNameOf(request),
        groupId: request.smallGroup.id,
        groupName: request.smallGroup.name,
        outcome,
      }
    })
    if ("error" in result && result.error) return fail(result.error)
    if (result.outcome.outcome === "skipped") {
      const reason = result.outcome.reason === "at-capacity"
        ? "The DGroup is at its member limit."
        : result.outcome.reason === "not-pending"
          ? "This request has already been resolved."
          : "The request can no longer be resolved."
      return fail(reason)
    }
    return { success: true, data: result }
  } catch {
    return fail("Failed to resolve the DGroup request.")
  }
}

/** Turn an unassigned registration intent into a group-targeted pending request. */
export async function targetMcpDGroupRequest(
  actor: McpActor,
  requestId: string,
  groupId: string,
): Promise<Result> {
  if (!actorCan(actor, "SmallGroups", "Write")) {
    return fail("You do not have permission to manage DGroup requests.")
  }
  try {
    const result = await db.$transaction(async (tx) => {
      const [request, group] = await Promise.all([
        tx.smallGroupMemberRequest.findUnique({
          where: { id: requestId },
          select: {
            id: true,
            status: true,
            smallGroupId: true,
            guestId: true,
            memberId: true,
            guest: { select: { firstName: true, lastName: true } },
            member: { select: { firstName: true, lastName: true, smallGroupId: true } },
          },
        }),
        tx.smallGroup.findUnique({
          where: { id: groupId },
          select: { id: true, name: true, memberLimit: true, _count: { select: { members: true } } },
        }),
      ])
      if (!request) return { error: "DGroup request not found." } as const
      if (!group) return { error: "DGroup not found." } as const
      if (request.status !== "Pending") return { error: "This request has already been resolved." } as const
      if (request.smallGroupId) return { error: "This request already targets a DGroup." } as const
      if (group.memberLimit !== null && group._count.members >= group.memberLimit) {
        return { error: "This DGroup is already at its member limit." } as const
      }
      if (!request.guestId && !request.memberId) return { error: "This request has no linked person." } as const

      const personName = request.member
        ? `${request.member.firstName} ${request.member.lastName}`
        : request.guest
          ? `${request.guest.firstName} ${request.guest.lastName}`
          : "Unknown"
      await tx.smallGroupMemberRequest.update({
        where: { id: request.id },
        data: {
          smallGroupId: group.id,
          fromGroupId: request.member?.smallGroupId ?? null,
          assignedByUserId: actor.id,
        },
      })
      await tx.smallGroupLog.create({
        data: {
          smallGroupId: group.id,
          action: "TempAssignmentCreated",
          guestId: request.guestId,
          memberId: request.memberId,
          fromGroupId: request.member?.smallGroupId ?? null,
          toGroupId: group.id,
          performedByUserId: actor.id,
          description: `${personName} was matched to this DGroup through the Churchie ChatGPT plugin (pending confirmation)`,
        },
      })
      return { requestId, groupId: group.id, groupName: group.name, personName, status: "Pending" }
    })
    if ("error" in result && result.error) return fail(result.error)
    return { success: true, data: result }
  } catch {
    return fail("Failed to assign the DGroup request.")
  }
}
