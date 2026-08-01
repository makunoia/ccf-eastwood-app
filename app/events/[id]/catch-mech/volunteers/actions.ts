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
  /**
   * Null when the volunteer leads no DGroup yet — the submission creates one and
   * every placement in it lands there. A volunteer who already leads groups must
   * always name a destination.
   */
  smallGroupId: string | null
}

/**
 * Thrown inside the placement transaction when the volunteer turns out to
 * already lead a group. Re-read under the transaction rather than trusting the
 * pre-flight check, which happens several queries earlier.
 *
 * This narrows the double-submit window; it does not close it. Postgres runs
 * these at READ COMMITTED, so two transactions can both observe zero led groups
 * and both create one. Closing it properly needs a unique partial index on
 * `SmallGroup.leaderId` — a migration, and a constraint the admin side would
 * also have to honour, so it is deliberately out of scope here. The realistic
 * case this does catch is one volunteer double-tapping submit.
 */
class AlreadyLeadsGroupError extends Error {}

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
      // `id` breaks the tie: two registrant rows for the same person are often
      // created in the same millisecond, and the dedup below keeps whichever
      // comes first — without a total order that choice flips between runs.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
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

/**
 * Records the people a volunteer absorbed into their own DGroup.
 *
 * A volunteer who leads no group yet is the Elevate/Movement case: absorbing
 * someone *is* the promotion, so passing `newGroupName` creates the group,
 * promotes the volunteer to Leader, and places everyone into it in one
 * transaction — the same shape as `createSmallGroupForTimothy` on the
 * facilitator side, minus the breakout link (a volunteer has no breakout group).
 */
export async function submitCatchMechVolunteerPlacements(
  token: string,
  placements: VolunteerPlacement[],
  newGroupName?: string
): Promise<ActionResult<{ placedCount: number; createdGroupId: string | null }>> {
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
    // A volunteer who leads nothing yet names one new group for the whole
    // submission; one who already leads groups picks a destination per person.
    const createsGroup = allowedGroupIds.size === 0 && placements.length > 0
    const groupName = newGroupName?.trim() ?? ""

    if (createsGroup) {
      if (!groupName) {
        return { success: false, error: "Name the DGroup these participants are joining" }
      }
      if (placements.some((placement) => placement.smallGroupId !== null)) {
        return { success: false, error: "You can only place participants in a DGroup you lead" }
      }
    } else if (
      placements.some(
        (placement) => !placement.smallGroupId || !allowedGroupIds.has(placement.smallGroupId)
      )
    ) {
      return { success: false, error: "You can only place participants in a DGroup you lead" }
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

    const { registrantMap, takenEmails } = await prefetchRegistrantData(
      placements.map((placement) => ({
        registrantId: placement.registrantId,
        status: "confirmed" as const,
      }))
    )
    const existingGroupIds = [
      ...new Set(
        placements
          .map((placement) => placement.smallGroupId)
          .filter((id): id is string => id !== null)
      ),
    ]
    const member = session.volunteer.member
    let createdGroupId: string | null = null

    await db.$transaction(async (tx) => {
      if (createsGroup) {
        const fresh = await tx.member.findUnique({
          where: { id: member.id },
          select: { ledGroups: { select: { id: true }, take: 1 } },
        })
        if (fresh && fresh.ledGroups.length > 0) throw new AlreadyLeadsGroupError()

        const created = await tx.smallGroup.create({
          data: { name: groupName, leaderId: member.id },
          select: { id: true },
        })
        createdGroupId = created.id

        await tx.smallGroupLog.create({
          data: {
            smallGroupId: created.id,
            action: "GroupCreated",
            performedByMemberId: member.id,
            description: `Group "${groupName}" was created via Catch Mech volunteer follow-up of ${session.event.name}`,
          },
        })
        // Absorbing someone is the promotion: a Timothy who takes in their first
        // person is a Leader from that moment.
        await tx.member.update({
          where: { id: member.id },
          data: { groupStatus: "Leader" },
        })
      }

      // Activate any targeted group that was pre-created via the volunteer info
      // form. A group created just above is already Active.
      await tx.smallGroup.updateMany({
        where: { id: { in: existingGroupIds }, status: "Pending" },
        data: { status: "Active" },
      })

      // Built inside the transaction because the new group's id does not exist
      // until it is created above.
      const decisions: ConfirmDecision[] = placements.map((placement) => ({
        registrantId: placement.registrantId,
        status: "confirmed",
        targetGroupId: placement.smallGroupId ?? createdGroupId ?? undefined,
      }))
      const resolved: ResolvedDecision[] = decisions.map((decision) => ({
        ...decision,
        groupId: decision.targetGroupId ?? null,
      }))

      await resolveConfirmations(
        null,
        session.volunteer.id,
        resolved,
        registrantMap,
        takenEmails,
        tx,
        session.event.name,
        member.id,
        "Catch Mech volunteer follow-up"
      )
      await recordConfirmationSubmission(tx, {
        source: "CatchMechVolunteer",
        volunteerSessionId: session.id,
        eventId: session.eventId,
        facilitatorVolunteerId: session.volunteer.id,
        submittedByMemberId: member.id,
        submittedByName: submitterName(member),
        createdGroupId,
        decisions,
        ...tallyDecisions(decisions),
      })
    }, { timeout: 30000 })

    for (const groupId of [...existingGroupIds, createdGroupId]) {
      if (groupId) revalidatePath(`/small-groups/${groupId}`)
    }
    if (createdGroupId) revalidatePath("/small-groups")
    revalidatePath(`/event/${session.eventId}/catch-mech`, "layout")
    revalidatePath(`/event/${session.eventId}/catch-mech/volunteers`)
    revalidatePath(`/event/${session.eventId}/dashboard`)

    return { success: true, data: { placedCount: placements.length, createdGroupId } }
  } catch (err) {
    if (err instanceof AlreadyLeadsGroupError) {
      return {
        success: false,
        error: "You already lead a DGroup — reopen this page to place participants into it.",
      }
    }
    console.error("[submitCatchMechVolunteerPlacements]", err)
    return { success: false, error: "Could not save your placements. Please try again." }
  }
}
