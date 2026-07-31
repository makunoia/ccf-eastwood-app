"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import type { Prisma } from "@/app/generated/prisma/client"
import { formatPhilippinePhone } from "@/lib/utils"
import { contactHintFrom } from "@/lib/contact-hint"
import { personSearchWhere } from "@/lib/search/name-search"
import {
  prefetchRegistrantData,
  resolveConfirmations,
} from "@/lib/catch-mech/confirmations"
import type { ConfirmDecision, ResolvedDecision } from "@/lib/catch-mech/decisions"
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

export type VolunteerParticipantResult = {
  registrantId: string
  name: string
  nickname: string | null
  kind: "Guest" | "Member"
  /** Masked phone/email so two same-named people can be told apart. */
  contactHint: string | null
}

/** Below this a query is too broad to be worth a round trip. */
const MIN_PARTICIPANT_QUERY = 2
/** Enough to disambiguate; short enough that nobody scrolls a wall of names. */
const PARTICIPANT_RESULT_LIMIT = 20

/**
 * Search this event's participants who are still eligible to join a DGroup.
 *
 * The form used to render every eligible registrant as a checkbox, which at a
 * real event is hundreds of rows a volunteer has to scroll to find the two or
 * three people they actually absorbed. Search inverts that: the volunteer types
 * the name they already know.
 *
 * Eligibility mirrors the placement submit exactly — a member with no DGroup, or
 * a guest not yet promoted — so nothing can be found here that would then be
 * refused on submit.
 */
export async function searchCatchMechVolunteerParticipants(
  token: string,
  query: string
): Promise<ActionResult<VolunteerParticipantResult[]>> {
  const nameMatch = personSearchWhere(query)
  if (query.trim().length < MIN_PARTICIPANT_QUERY || !nameMatch) {
    return { success: true, data: [] }
  }

  try {
    const session = await db.catchMechVolunteerSession.findUnique({
      where: { token },
      select: {
        eventId: true,
        event: { select: { modules: { select: { type: true } } } },
        volunteer: { select: { status: true } },
      },
    })
    if (
      !session ||
      session.volunteer.status !== "Confirmed" ||
      !session.event.modules.some((module) => module.type === "CatchMech")
    ) {
      return { success: false, error: "This volunteer session is no longer available" }
    }

    // `is` keeps a null relation from matching: a registrant with no member row
    // must not fall into the member branch just because the filter is nullable.
    const registrants = await db.eventRegistrant.findMany({
      where: {
        eventId: session.eventId,
        OR: [
          { member: { is: { smallGroupId: null, ...(nameMatch as Prisma.MemberWhereInput) } } },
          { guest: { is: { memberId: null, ...(nameMatch as Prisma.GuestWhereInput) } } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: PARTICIPANT_RESULT_LIMIT,
      select: {
        id: true,
        memberId: true,
        guestId: true,
        member: {
          select: { firstName: true, lastName: true, nickname: true, phone: true, email: true },
        },
        guest: {
          select: { firstName: true, lastName: true, nickname: true, phone: true, email: true },
        },
      },
    })

    // One person can hold several registrant rows for the same event (a duplicate
    // sign-up). Collapsing on the underlying profile keeps the picker from
    // offering the same human twice, which would fail the submit's dedup check.
    const seen = new Set<string>()
    const results: VolunteerParticipantResult[] = []
    for (const registrant of registrants) {
      const person = registrant.member ?? registrant.guest
      if (!person) continue
      const key = registrant.memberId ?? registrant.guestId
      if (!key || seen.has(key)) continue
      seen.add(key)
      results.push({
        registrantId: registrant.id,
        name: `${person.firstName} ${person.lastName}`.trim(),
        nickname: person.nickname,
        kind: registrant.memberId ? "Member" : "Guest",
        contactHint: contactHintFrom(person.phone, person.email),
      })
    }

    results.sort((a, b) => a.name.localeCompare(b.name))
    return { success: true, data: results }
  } catch (err) {
    console.error("[searchCatchMechVolunteerParticipants]", err)
    return { success: false, error: "Search failed. Please try again." }
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
      return { success: false, error: "You can only place participants in a DGroup you lead" }
    }
    if (placements.length > 0 && allowedGroupIds.size === 0) {
      return { success: false, error: "You do not lead a DGroup for these placements" }
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
        return { success: false, error: "One or more selected participants are already in a DGroup" }
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
