"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canAccessEvent, canWrite } from "@/lib/permissions"
import { logMembershipMove } from "@/lib/small-groups/membership-log"
import { advancePendingInterest } from "@/lib/small-groups/advance-interest"
import { clearUpwardSatelliteOnConfirm } from "@/lib/small-groups/upward-satellite"
import { matchSmallGroups, matchSmallGroupsWithEscalation } from "@/lib/matching"
import type { MatchResult } from "@/lib/matching/types"

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }
export type InterestMatchLevel = { label: string; matches: MatchResult[] }

class InterestActionError extends Error {}

async function interestActor(eventId: string): Promise<string | null> {
  const session = await auth()
  if (!session?.user || !canAccessEvent(session, eventId) || !canWrite(session, "SmallGroups")) {
    return null
  }
  return session.user.id ?? null
}

async function pendingInterest(eventId: string, requestId: string) {
  return db.smallGroupMemberRequest.findFirst({
    where: {
      id: requestId,
      sourceEventId: eventId,
      origin: "RegistrationIntent",
      status: "Pending",
      smallGroupId: null,
    },
    select: { id: true, guestId: true, memberId: true },
  })
}

async function matchingLevels(
  eventId: string,
  person: { guestId: string | null; memberId: string | null }
): Promise<InterestMatchLevel[]> {
  if (person.memberId) {
    const matches = await matchSmallGroups(
      { memberId: person.memberId },
      { excludeCurrentGroup: true, limit: 10 }
    )
    return matches.length ? [{ label: "Matching DGroups", matches }] : []
  }
  if (!person.guestId) return []
  const levels = await matchSmallGroupsWithEscalation(person.guestId, eventId)
  const label: Record<number, string> = {
    1: "Breakout facilitators' DGroups",
    2: "Event volunteers' DGroups",
    3: "Other matching DGroups",
  }
  return levels.map((level) => ({ label: label[level.level], matches: level.matches }))
}

export async function getCatchMechInterestMatches(
  eventId: string,
  requestId: string
): Promise<ActionResult<InterestMatchLevel[]>> {
  if (!(await interestActor(eventId))) return { success: false, error: "Unauthorized." }
  try {
    const request = await pendingInterest(eventId, requestId)
    if (!request) return { success: false, error: "This interest request has already changed." }
    return { success: true, data: await matchingLevels(eventId, request) }
  } catch {
    return { success: false, error: "Failed to find matching DGroups." }
  }
}

/** Move the same event-sourced request through assignment and later confirmation. */
export async function assignCatchMechInterest(
  eventId: string,
  requestId: string,
  groupId: string
): Promise<ActionResult<"placed" | "awaiting-confirmation">> {
  const actorId = await interestActor(eventId)
  if (!actorId) return { success: false, error: "Unauthorized." }
  try {
    const request = await pendingInterest(eventId, requestId)
    if (!request) return { success: false, error: "This interest request has already changed." }

    // Only offer a group the established matching engine currently considers
    // eligible for this person. The action rechecks after the inline list loads.
    const levels = await matchingLevels(eventId, request)
    if (!levels.some((level) => level.matches.some((match) => match.groupId === groupId))) {
      return { success: false, error: "This DGroup is no longer a match. Refresh the suggestions." }
    }

    const outcome = await db.$transaction(async (tx) => {
      const group = await tx.smallGroup.findUnique({
        where: { id: groupId },
        select: { status: true, memberLimit: true, _count: { select: { members: true } } },
      })
      if (!group || group.status === "Inactive") throw new InterestActionError("This DGroup is no longer available.")

      if (request.memberId) {
        const member = await tx.member.findUnique({
          where: { id: request.memberId },
          select: { firstName: true, lastName: true, smallGroupId: true },
        })
        if (!member || member.smallGroupId === groupId) throw new InterestActionError("This member's DGroup details have changed.")
        if (group.memberLimit !== null && group._count.members >= group.memberLimit) {
          throw new InterestActionError("This DGroup has reached its member limit.")
        }
        await advancePendingInterest(tx, {
          person: { memberId: request.memberId },
          groupId,
          status: member.smallGroupId ? "Pending" : "Confirmed",
          actorId,
          fromGroupId: member.smallGroupId,
          requestId,
        })
        if (member.smallGroupId) {
          await tx.smallGroupLog.create({
            data: {
              smallGroupId: groupId,
              action: "TempAssignmentCreated",
              memberId: request.memberId,
              fromGroupId: member.smallGroupId,
              toGroupId: groupId,
              performedByUserId: actorId,
              description: `${member.firstName} ${member.lastName} was matched from an event DGroup interest request for transfer (pending leader confirmation)`,
            },
          })
          return "awaiting-confirmation" as const
        }
        const placed = await tx.member.updateMany({
          where: { id: request.memberId, smallGroupId: null },
          data: { smallGroupId: groupId, groupStatus: "Member" },
        })
        if (placed.count !== 1) throw new InterestActionError("This member's DGroup details have changed.")
        await clearUpwardSatelliteOnConfirm(tx, [request.memberId])
        if (group.status === "Pending") {
          await tx.smallGroup.update({ where: { id: groupId }, data: { status: "Active" } })
        }
        await logMembershipMove(tx, {
          memberId: request.memberId,
          memberName: `${member.firstName} ${member.lastName}`,
          fromGroupId: null,
          toGroupId: groupId,
          actor: { userId: actorId },
          context: "from an event DGroup interest request",
        })
        return "placed" as const
      }

      if (!request.guestId) throw new InterestActionError("This interest request has no person.")
      const guest = await tx.guest.findUnique({
        where: { id: request.guestId },
        select: { firstName: true, lastName: true, memberId: true },
      })
      if (!guest || guest.memberId) throw new InterestActionError("This guest's DGroup details have changed.")
      await advancePendingInterest(tx, {
        person: { guestId: request.guestId },
        groupId,
        status: "Pending",
        actorId,
        requestId,
      })
      await tx.smallGroupLog.create({
        data: {
          smallGroupId: groupId,
          action: "TempAssignmentCreated",
          guestId: request.guestId,
          performedByUserId: actorId,
          description: `${guest.firstName} ${guest.lastName} was matched from an event DGroup interest request (pending leader confirmation)`,
        },
      })
      return "awaiting-confirmation" as const
    })

    revalidatePath(`/event/${eventId}/catch-mech`)
    revalidatePath(`/small-groups/${groupId}`)
    revalidatePath("/small-groups")
    if (request.memberId) revalidatePath(`/members/${request.memberId}`)
    if (request.guestId) revalidatePath(`/guests/${request.guestId}`)
    return { success: true, data: outcome }
  } catch (error) {
    if (error instanceof InterestActionError) return { success: false, error: error.message }
    return { success: false, error: "Failed to assign DGroup interest." }
  }
}

export async function dismissCatchMechInterest(
  eventId: string,
  requestId: string
): Promise<ActionResult<void>> {
  if (!(await interestActor(eventId))) return { success: false, error: "Unauthorized." }
  try {
    const updated = await db.smallGroupMemberRequest.updateMany({
      where: { id: requestId, sourceEventId: eventId, origin: "RegistrationIntent", status: "Pending", smallGroupId: null },
      data: { status: "Rejected", resolvedAt: new Date() },
    })
    if (updated.count !== 1) return { success: false, error: "This interest request has already changed." }
    revalidatePath(`/event/${eventId}/catch-mech`)
    revalidatePath("/small-groups")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to dismiss DGroup interest." }
  }
}
