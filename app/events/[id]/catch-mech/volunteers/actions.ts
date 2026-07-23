"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { formatPhilippinePhone } from "@/lib/utils"
import {
  prefetchRegistrantData,
  resolveConfirmations,
  type ConfirmDecision,
  type ResolvedDecision,
} from "../actions"
import {
  recordConfirmationSubmission,
  submitterName,
  tallyDecisions,
} from "@/lib/catch-mech/submission-log"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export type VolunteerPlacement = {
  registrantId: string
  smallGroupId: string
}

export async function verifyCatchMechVolunteer(
  eventId: string,
  mobile: string
): Promise<ActionResult<{ token: string }>> {
  const phone = formatPhilippinePhone(mobile)
  if (!phone) {
    return { success: false, error: "Mobile number is required" }
  }

  try {
    const member = await db.member.findFirst({
      where: { phone },
      select: { id: true },
    })
    if (!member) {
      return { success: false, error: "No member found with that mobile number" }
    }

    const volunteer = await db.volunteer.findFirst({
      where: { eventId, memberId: member.id, status: "Confirmed" },
      select: { id: true },
    })
    if (!volunteer) {
      return {
        success: false,
        error: "You are not a confirmed volunteer for this event",
      }
    }

    const session = await db.catchMechVolunteerSession.upsert({
      where: {
        eventId_volunteerId: {
          eventId,
          volunteerId: volunteer.id,
        },
      },
      create: { eventId, volunteerId: volunteer.id },
      update: {},
      select: { token: true },
    })
    return { success: true, data: { token: session.token } }
  } catch (err) {
    console.error("[verifyCatchMechVolunteer]", err)
    return { success: false, error: "Could not verify your volunteer record. Please try again." }
  }
}

export async function submitCatchMechVolunteerPlacements(
  token: string,
  placements: VolunteerPlacement[]
): Promise<ActionResult<{ placedCount: number }>> {
  const registrantIds = placements.map((placement) => placement.registrantId)
  if (new Set(registrantIds).size !== registrantIds.length) {
    return { success: false, error: "Each participant can only be selected once" }
  }

  try {
    const session = await db.catchMechVolunteerSession.findUnique({
      where: { token },
      select: {
        id: true,
        eventId: true,
        event: { select: { name: true } },
        volunteer: {
          select: {
            id: true,
            status: true,
            member: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                ledGroups: { select: { id: true } },
              },
            },
          },
        },
      },
    })
    if (!session || session.volunteer.status !== "Confirmed") {
      return { success: false, error: "This volunteer session is no longer available" }
    }

    const allowedGroupIds = new Set(session.volunteer.member.ledGroups.map((group) => group.id))
    if (placements.some((placement) => !allowedGroupIds.has(placement.smallGroupId))) {
      return { success: false, error: "You can only place participants in a small group you lead" }
    }
    if (placements.length > 0 && allowedGroupIds.size === 0) {
      return { success: false, error: "You do not lead a small group for these placements" }
    }

    const registrants = await db.eventRegistrant.findMany({
      where: { id: { in: registrantIds }, eventId: session.eventId },
      select: {
        id: true,
        memberId: true,
        guestId: true,
        member: { select: { smallGroupId: true } },
        guest: { select: { memberId: true } },
      },
    })
    if (registrants.length !== placements.length) {
      return { success: false, error: "One or more selected participants do not belong to this event" }
    }

    for (const registrant of registrants) {
      const eligibleGuest = !!registrant.guestId && !registrant.guest?.memberId
      const eligibleMember = !!registrant.memberId && !registrant.member?.smallGroupId
      if (!eligibleGuest && !eligibleMember) {
        return { success: false, error: "One or more selected participants are already in a small group" }
      }
    }

    const decisions: ConfirmDecision[] = placements.map((placement) => ({
      registrantId: placement.registrantId,
      status: "confirmed",
      targetGroupId: placement.smallGroupId,
    }))
    const resolved: ResolvedDecision[] = decisions.map((decision) => ({
      ...decision,
      groupId: decision.targetGroupId ?? null,
    }))
    const { registrantMap, takenEmails } = await prefetchRegistrantData(decisions)
    const touchedGroupIds = [...new Set(placements.map((placement) => placement.smallGroupId))]

    await db.$transaction(async (tx) => {
      await tx.smallGroup.updateMany({
        where: { id: { in: touchedGroupIds }, status: "Pending" },
        data: { status: "Active" },
      })
      await resolveConfirmations(
        null,
        session.volunteer.id,
        resolved,
        registrantMap,
        takenEmails,
        tx,
        session.event.name,
        session.volunteer.member.id,
        "Catch Mech volunteer follow-up"
      )
      await recordConfirmationSubmission(tx, {
        source: "CatchMechVolunteer",
        volunteerSessionId: session.id,
        eventId: session.eventId,
        facilitatorVolunteerId: session.volunteer.id,
        submittedByMemberId: session.volunteer.member.id,
        submittedByName: submitterName(session.volunteer.member),
        decisions,
        ...tallyDecisions(decisions),
      })
    }, { timeout: 30000 })

    for (const groupId of touchedGroupIds) {
      revalidatePath(`/small-groups/${groupId}`)
    }
    revalidatePath(`/event/${session.eventId}/catch-mech`, "layout")
    revalidatePath(`/event/${session.eventId}/catch-mech/volunteers`)
    revalidatePath(`/event/${session.eventId}/dashboard`)

    return { success: true, data: { placedCount: placements.length } }
  } catch (err) {
    console.error("[submitCatchMechVolunteerPlacements]", err)
    return { success: false, error: "Could not save your placements. Please try again." }
  }
}
