"use server"

import { DeclineReason, type Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { repointFamilyLinks } from "@/lib/family-links"
import {
  resolveCatchMechTargets,
  type CandidateGroup,
} from "@/lib/catch-mech/targets"
import {
  recordConfirmationSubmission,
  submitterName,
  tallyDecisions,
} from "@/lib/catch-mech/submission-log"
import { revalidatePath } from "next/cache"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// ─── Faci identity verification ──────────────────────────────────────────────

export async function verifyCatchMechFaci(
  eventId: string,
  breakoutGroupId: string,
  mobile: string
): Promise<ActionResult<{ token: string }>> {
  if (!mobile.trim()) {
    return { success: false, error: "Mobile number is required" }
  }

  const member = await db.member.findFirst({
    where: { phone: mobile.trim() },
    select: { id: true },
  })
  if (!member) {
    return { success: false, error: "No member found with that mobile number" }
  }

  const breakoutGroup = await db.breakoutGroup.findUnique({
    where: { id: breakoutGroupId },
    select: {
      facilitator: { select: { id: true, memberId: true } },
      coFacilitator: { select: { id: true, memberId: true } },
    },
  })
  if (!breakoutGroup) {
    return { success: false, error: "Breakout group not found" }
  }

  const faci =
    breakoutGroup.facilitator?.memberId === member.id
      ? breakoutGroup.facilitator
      : breakoutGroup.coFacilitator?.memberId === member.id
      ? breakoutGroup.coFacilitator
      : null

  if (!faci) {
    return {
      success: false,
      error: "You are not registered as a facilitator for this group",
    }
  }

  // Upsert session — one per volunteer+breakoutGroup combination
  const existing = await db.catchMechSession.findFirst({
    where: { facilitatorVolunteerId: faci.id, breakoutGroupId },
    select: { token: true },
  })

  if (existing) {
    return { success: true, data: { token: existing.token } }
  }

  const session = await db.catchMechSession.create({
    data: { eventId, breakoutGroupId, facilitatorVolunteerId: faci.id },
    select: { token: true },
  })

  return { success: true, data: { token: session.token } }
}

// ─── Submit confirmations ─────────────────────────────────────────────────────

export type ConfirmDecision = {
  registrantId: string
  status: "confirmed" | "pending" | "declined"
  // Which of the faci's groups absorbs this person. Required on confirm when the
  // faci has more than one candidate group; ignored otherwise.
  targetGroupId?: string
  declineReason?: DeclineReason
  // Free-text detail, only used when declineReason is "Others"
  reason?: string
}

function validateDecisions(decisions: ConfirmDecision[]): string | null {
  for (const d of decisions) {
    if (d.status !== "declined") continue
    if (!d.declineReason || !(d.declineReason in DeclineReason)) {
      return "A decline reason is required for every declined member"
    }
    if (d.declineReason === "Others" && !d.reason?.trim()) {
      return "Please specify the reason when declining with Others"
    }
  }
  return null
}

/**
 * A faci leading several groups picks a destination per confirmed person. With one
 * candidate the picker never renders, so the single group is implied.
 */
function validateTargets(
  decisions: ConfirmDecision[],
  candidates: CandidateGroup[]
): string | null {
  if (candidates.length <= 1) return null
  for (const d of decisions) {
    if (d.status !== "confirmed") continue
    if (!d.targetGroupId) {
      return "Please choose which small group each confirmed person will join"
    }
    if (!candidates.some((c) => c.id === d.targetGroupId)) {
      return "You can only confirm people into a small group you lead"
    }
  }
  return null
}

/** A decision paired with the group it resolves to (null = groupless decline). */
type ResolvedDecision = ConfirmDecision & { groupId: string | null }

function resolveTargets(
  decisions: ConfirmDecision[],
  candidates: CandidateGroup[],
  declineGroupId: string | null
): ResolvedDecision[] {
  return decisions.map((d) => {
    if (d.status === "confirmed") {
      return { ...d, groupId: d.targetGroupId ?? candidates[0]?.id ?? null }
    }
    if (d.status === "declined") return { ...d, groupId: declineGroupId }
    return { ...d, groupId: null }
  })
}

export type ConfirmResult =
  | { success: true; requiresGroupName: false }
  | { success: true; requiresGroupName: true }
  | { success: false; error: string }

export async function submitCatchMechConfirmations(
  token: string,
  decisions: ConfirmDecision[]
): Promise<ConfirmResult> {
  const validationError = validateDecisions(decisions)
  if (validationError) {
    return { success: false, error: validationError }
  }

  const session = await db.catchMechSession.findUnique({
    where: { token },
    select: {
      id: true,
      eventId: true,
      facilitatorVolunteerId: true,
      breakoutGroupId: true,
      breakoutGroup: {
        select: {
          facilitatorId: true,
          linkedSmallGroup: { select: { id: true, name: true } },
        },
      },
      facilitator: {
        select: {
          memberId: true,
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              ledGroups: {
                select: { id: true, name: true },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      },
    },
  })
  if (!session) {
    return { success: false, error: "Session not found or expired" }
  }

  const { candidates, declineGroupId } = resolveCatchMechTargets(session)

  const targetError = validateTargets(decisions, candidates)
  if (targetError) {
    return { success: false, error: targetError }
  }

  // Timothy — leads no group and none is linked. They can only absorb someone once
  // they have a group, so a confirmation sends them to the name step first. Declines
  // need no group and persist right here.
  if (candidates.length === 0) {
    if (decisions.some((d) => d.status === "confirmed")) {
      // Deliberately not recorded: nothing is persisted here and the same logical
      // submission completes in createSmallGroupForTimothy, which logs it. Logging
      // both would double-count one answer.
      return { success: true, requiresGroupName: true }
    }
    return persistGrouplessDeclines(session, decisions)
  }

  const [event, { registrantMap, takenEmails }] = await Promise.all([
    db.event.findUnique({ where: { id: session.eventId }, select: { name: true } }),
    prefetchRegistrantData(decisions),
  ])
  const eventName = event?.name ?? null

  const resolved = resolveTargets(decisions, candidates, declineGroupId)
  const touchedGroupIds = [
    ...new Set(resolved.map((d) => d.groupId).filter((id): id is string => id !== null)),
  ]

  try {
    await db.$transaction(async (tx) => {
      // Activate any targeted group that was pre-created via the volunteer info form
      await tx.smallGroup.updateMany({
        where: { id: { in: touchedGroupIds }, status: "Pending" },
        data: { status: "Active" },
      })
      await resolveConfirmations(
        session.breakoutGroupId,
        session.facilitatorVolunteerId,
        resolved,
        registrantMap,
        takenEmails,
        tx,
        eventName,
        session.facilitator.member.id
      )

      await recordConfirmationSubmission(tx, {
        source: "CatchMech",
        sessionId: session.id,
        eventId: session.eventId,
        breakoutGroupId: session.breakoutGroupId,
        facilitatorVolunteerId: session.facilitatorVolunteerId,
        submittedByMemberId: session.facilitator.member.id,
        submittedByName: submitterName(session.facilitator.member),
        decisions,
        ...tallyDecisions(decisions),
      })
    }, { timeout: 30000 })
  } catch (err) {
    console.error("[submitCatchMechConfirmations]", err)
    return { success: false, error: "Could not save your confirmations. Please try again." }
  }

  for (const groupId of touchedGroupIds) revalidatePath(`/small-groups/${groupId}`)
  revalidatePath(`/event/${session.eventId}/catch-mech`, "layout")
  revalidatePath(`/event/${session.eventId}/dashboard`)
  return { success: true, requiresGroupName: false }
}

/**
 * Records declines made by a faci who leads no group yet. Without a group there is
 * nothing to join, so only the rejection and its reason are kept — scoped to the
 * declining faci so a co-faci's list is untouched.
 */
async function persistGrouplessDeclines(
  session: {
    id: string
    eventId: string
    breakoutGroupId: string
    facilitatorVolunteerId: string
    facilitator: { member: { id: string; firstName: string; lastName: string } }
  },
  decisions: ConfirmDecision[]
): Promise<ConfirmResult> {
  const declined = decisions.filter((d) => d.status === "declined")

  const { registrantMap } = await prefetchRegistrantData(declined)

  try {
    await db.$transaction(async (tx) => {
      // No early return on an empty decline list — this is the one path where a
      // faci's answer can produce zero member requests, so the submission row is
      // the only record that they responded at all.
      for (const d of declined) {
        const registrant = registrantMap.get(d.registrantId)
        if (!registrant) continue
        if (!registrant.memberId && !registrant.guestId) continue

        const identity = registrant.memberId
          ? { memberId: registrant.memberId }
          : { guestId: registrant.guestId! }

        const existing = await tx.smallGroupMemberRequest.findFirst({
          where: {
            smallGroupId: null,
            status: "Rejected",
            declinedByVolunteerId: session.facilitatorVolunteerId,
            ...identity,
          },
          select: { id: true },
        })
        if (existing) continue

        await tx.smallGroupMemberRequest.create({
          data: {
            smallGroupId: null,
            breakoutGroupId: session.breakoutGroupId,
            declinedByVolunteerId: session.facilitatorVolunteerId,
            status: "Rejected",
            resolvedAt: new Date(),
            declineReason: d.declineReason ?? null,
            notes: d.reason ?? null,
            ...identity,
          },
        })
      }

      await recordConfirmationSubmission(tx, {
        source: "CatchMech",
        sessionId: session.id,
        eventId: session.eventId,
        breakoutGroupId: session.breakoutGroupId,
        facilitatorVolunteerId: session.facilitatorVolunteerId,
        submittedByMemberId: session.facilitator.member.id,
        submittedByName: submitterName(session.facilitator.member),
        decisions,
        ...tallyDecisions(decisions),
      })
    }, { timeout: 30000 })
  } catch (err) {
    console.error("[persistGrouplessDeclines]", err)
    return { success: false, error: "Could not save your declines. Please try again." }
  }

  revalidatePath(`/event/${session.eventId}/catch-mech`, "layout")
  revalidatePath(`/event/${session.eventId}/dashboard`)
  return { success: true, requiresGroupName: false }
}

// ─── Create small group for a Timothy and confirm members ────────────────────

export async function createSmallGroupForTimothy(
  token: string,
  groupName: string,
  decisions: ConfirmDecision[]
): Promise<ActionResult> {
  if (!groupName.trim()) {
    return { success: false, error: "Group name is required" }
  }

  const validationError = validateDecisions(decisions)
  if (validationError) {
    return { success: false, error: validationError }
  }

  const session = await db.catchMechSession.findUnique({
    where: { token },
    select: {
      id: true,
      eventId: true,
      facilitatorVolunteerId: true,
      breakoutGroupId: true,
      breakoutGroup: { select: { facilitatorId: true } },
      facilitator: {
        select: {
          memberId: true,
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              ledGroups: { select: { id: true }, take: 1 },
            },
          },
        },
      },
    },
  })
  if (!session) {
    return { success: false, error: "Session not found or expired" }
  }

  const faciMember = session.facilitator.member
  // The breakout's linked group belongs to the LEAD facilitator. A co-facilitator
  // creating their own group must not overwrite the lead's breakout link.
  const isLeadFaci = session.facilitatorVolunteerId === session.breakoutGroup.facilitatorId

  // Guard: must still be a Timothy (no leading group)
  if (faciMember.ledGroups.length > 0) {
    return { success: false, error: "You already lead a small group" }
  }

  // Pre-fetch all reads outside the transaction
  const [event, { registrantMap, takenEmails }] = await Promise.all([
    db.event.findUnique({ where: { id: session.eventId }, select: { name: true } }),
    prefetchRegistrantData(decisions),
  ])
  const eventName = event?.name ?? null

  let newGroupId: string | null = null

  try {
    await db.$transaction(async (tx) => {
      // Create the small group
      const created = await tx.smallGroup.create({
        data: { name: groupName.trim(), leaderId: faciMember.id },
        select: { id: true },
      })
      newGroupId = created.id

      await tx.smallGroupLog.create({
        data: {
          smallGroupId: created.id,
          action: "GroupCreated",
          performedByMemberId: faciMember.id,
          description: `Group "${groupName.trim()}" was created via Catch Mech${eventName ? ` of ${eventName}` : ""}`,
        },
      })

      // Link the breakout group to the newly created small group — only when the
      // acting faci is the LEAD. A co-faci's group must not hijack the lead's link.
      if (isLeadFaci) {
        await tx.breakoutGroup.update({
          where: { id: session.breakoutGroupId },
          data: { linkedSmallGroupId: created.id },
        })
      }

      // Promote the faci's status to Leader in their home group
      await tx.member.update({
        where: { id: faciMember.id },
        data: { groupStatus: "Leader" },
      })

      // The new group is this Timothy's only destination — every confirm and decline
      // resolves to it.
      await resolveConfirmations(
        session.breakoutGroupId,
        session.facilitatorVolunteerId,
        decisions.map((d) => ({ ...d, groupId: created.id })),
        registrantMap,
        takenEmails,
        tx,
        eventName,
        faciMember.id
      )

      await recordConfirmationSubmission(tx, {
        source: "CatchMech",
        sessionId: session.id,
        eventId: session.eventId,
        breakoutGroupId: session.breakoutGroupId,
        facilitatorVolunteerId: session.facilitatorVolunteerId,
        submittedByMemberId: faciMember.id,
        submittedByName: submitterName(faciMember),
        createdGroupId: created.id,
        decisions,
        ...tallyDecisions(decisions),
      })
    }, { timeout: 30000 })

    revalidatePath("/small-groups")
    revalidatePath(`/event/${session.eventId}/catch-mech`, "layout")
    revalidatePath(`/event/${session.eventId}/breakouts/${session.breakoutGroupId}`)
    revalidatePath(`/event/${session.eventId}/dashboard`)

    // Auto-link other breakout groups where this member is the LEAD facilitator across
    // all events — linkedSmallGroupId always represents the lead faci's group.
    if (newGroupId) {
      const otherBreakouts = await db.breakoutGroup.findMany({
        where: {
          linkedSmallGroupId: null,
          id: { not: session.breakoutGroupId },
          facilitator: { memberId: faciMember.id },
        },
        select: { id: true, eventId: true },
      })
      if (otherBreakouts.length > 0) {
        await db.breakoutGroup.updateMany({
          where: { id: { in: otherBreakouts.map((b) => b.id) } },
          data: { linkedSmallGroupId: newGroupId },
        })
        const otherEventIds = [...new Set(otherBreakouts.map((b) => b.eventId))]
        for (const eid of otherEventIds) {
          revalidatePath(`/event/${eid}/breakouts`)
          revalidatePath(`/event/${eid}/catch-mech`, "layout")
          revalidatePath(`/event/${eid}/dashboard`)
        }
      }
    }

    return { success: true, data: undefined }
  } catch (err) {
    console.error("[createSmallGroupForTimothy]", err)
    return { success: false, error: "Failed to create small group" }
  }
}

// ─── Pre-fetch registrant data in bulk (outside transaction) ─────────────────

const registrantSelect = {
  id: true,
  memberId: true,
  guestId: true,
  member: { select: { firstName: true, lastName: true, smallGroupId: true } },
  guest: {
    select: {
      firstName: true,
      lastName: true,
      memberId: true,
      email: true,
      phone: true,
      notes: true,
      lifeStageId: true,
      gender: true,
      language: true,
      birthMonth: true,
      birthYear: true,
      workCity: true,
      workIndustry: true,
      meetingPreference: true,
      scheduleDayOfWeek: true,
      scheduleTimeStart: true,
    },
  },
} satisfies Prisma.EventRegistrantSelect

type FetchedRegistrant = Prisma.EventRegistrantGetPayload<{ select: typeof registrantSelect }>

async function prefetchRegistrantData(decisions: ConfirmDecision[]): Promise<{
  registrantMap: Map<string, FetchedRegistrant>
  takenEmails: Set<string>
}> {
  const ids = decisions.map((d) => d.registrantId)

  const registrants = await db.eventRegistrant.findMany({
    where: { id: { in: ids } },
    select: registrantSelect,
  })

  const registrantMap = new Map(registrants.map((r) => [r.id, r]))

  // Collect all guest emails that need a uniqueness check
  const guestEmails = registrants
    .filter((r) => r.guest?.email)
    .map((r) => r.guest!.email!)

  let takenEmails = new Set<string>()
  if (guestEmails.length > 0) {
    const existing = await db.member.findMany({
      where: { email: { in: guestEmails } },
      select: { email: true },
    })
    takenEmails = new Set(existing.map((m) => m.email!))
  }

  return { registrantMap, takenEmails }
}

// ─── Shared confirmation resolver (writes only — reads pre-fetched) ───────────

async function resolveConfirmations(
  breakoutGroupId: string,
  faciVolunteerId: string,
  decisions: ResolvedDecision[],
  registrantMap: Map<string, FetchedRegistrant>,
  takenEmails: Set<string>,
  tx: Prisma.TransactionClient,
  eventName: string | null,
  /** The faci's Member — public flow has no User, so this is the only attribution. */
  actorMemberId: string | null
): Promise<void> {
  const now = new Date()

  for (const { registrantId, status, declineReason, reason, groupId } of decisions) {
    const registrant = registrantMap.get(registrantId)
    if (!registrant) continue
    if (!registrant.memberId && !registrant.guestId) continue

    // "pending" — leave as-is, no DB update
    if (status === "pending") continue
    // Callers resolve a group for every confirm/decline they route here; a groupless
    // decline goes through persistGrouplessDeclines instead.
    if (!groupId) continue
    const smallGroupId = groupId

    if (status === "declined") {
      const personName = registrant.member
        ? `${registrant.member.firstName} ${registrant.member.lastName}`
        : registrant.guest
          ? `${registrant.guest.firstName} ${registrant.guest.lastName}`
          : "Unknown"
      const pendingRequest = await tx.smallGroupMemberRequest.findFirst({
        where: {
          smallGroupId,
          status: "Pending",
          ...(registrant.memberId
            ? { memberId: registrant.memberId }
            : { guestId: registrant.guestId! }),
        },
        select: { id: true },
      })
      if (pendingRequest) {
        await tx.smallGroupMemberRequest.update({
          where: { id: pendingRequest.id },
          data: { status: "Rejected", resolvedAt: now, breakoutGroupId, declinedByVolunteerId: faciVolunteerId, declineReason: declineReason ?? null, notes: reason ?? null },
        })
      } else {
        // No pre-existing request (e.g. Timothy's group didn't exist yet at assignment time)
        await tx.smallGroupMemberRequest.create({
          data: {
            smallGroupId,
            breakoutGroupId,
            declinedByVolunteerId: faciVolunteerId,
            status: "Rejected",
            resolvedAt: now,
            declineReason: declineReason ?? null,
            notes: reason ?? null,
            ...(registrant.memberId
              ? { memberId: registrant.memberId }
              : { guestId: registrant.guestId! }),
          },
        })
      }
      await tx.smallGroupLog.create({
        data: {
          smallGroupId,
          action: "TempAssignmentRejected",
          guestId: registrant.guestId ?? null,
          memberId: registrant.memberId ?? null,
          performedByMemberId: actorMemberId,
          description: `${personName}'s membership was declined via Catch Mech${eventName ? ` of ${eventName}` : ""}`,
        },
      })
      continue
    }

    // status === "confirmed" from here
    if (registrant.guestId && registrant.guest && !registrant.guest.memberId) {
      const guest = registrant.guest
      // No capacity gate here: a facilitator's explicit confirmation always wins.
      // memberLimit is a soft target that steers auto-matching suggestions, never a
      // hard wall — silently dropping a confirmed person (no member, no request, no
      // error) left them stuck on the form with the status never transitioning.
      const newMember = await tx.member.create({
        data: {
          firstName: guest.firstName,
          lastName: guest.lastName,
          email: guest.email && takenEmails.has(guest.email) ? null : (guest.email ?? null),
          phone: guest.phone ?? null,
          notes: guest.notes ?? null,
          lifeStageId: guest.lifeStageId ?? null,
          gender: guest.gender ?? null,
          language: guest.language,
          birthMonth: guest.birthMonth ?? null,
          birthYear: guest.birthYear ?? null,
          workCity: guest.workCity ?? null,
          workIndustry: guest.workIndustry ?? null,
          meetingPreference: guest.meetingPreference ?? null,
          dateJoined: now,
          smallGroupId,
          groupStatus: "Member",
          ...(guest.scheduleDayOfWeek !== null && guest.scheduleTimeStart !== null
            ? {
                schedulePreferences: {
                  create: {
                    dayOfWeek: guest.scheduleDayOfWeek,
                    timeStart: guest.scheduleTimeStart!,
                  },
                },
              }
            : {}),
        },
        select: { id: true },
      })

      await tx.guest.update({
        where: { id: registrant.guestId },
        data: { memberId: newMember.id },
      })
      await tx.eventRegistrant.updateMany({
        where: { guestId: registrant.guestId },
        data: { memberId: newMember.id, guestId: null },
      })
      await repointFamilyLinks(tx, { guestId: registrant.guestId }, { memberId: newMember.id })
      await tx.smallGroupLog.create({
        data: {
          smallGroupId,
          action: "MemberAdded",
          memberId: newMember.id,
          performedByMemberId: actorMemberId,
          description: `${guest.firstName} ${guest.lastName} confirmed via Catch Mech${eventName ? ` of ${eventName}` : ""} and joined the group`,
        },
      })
      const updated = await tx.smallGroupMemberRequest.updateMany({
        where: { guestId: registrant.guestId, smallGroupId, status: "Pending" },
        data: { status: "Confirmed", resolvedAt: now, memberId: newMember.id, guestId: null, breakoutGroupId },
      })
      if (updated.count === 0) {
        // No pre-existing request — create a confirmed record so the admin page tracks it
        await tx.smallGroupMemberRequest.create({
          data: {
            smallGroupId,
            breakoutGroupId,
            memberId: newMember.id,
            status: "Confirmed",
            resolvedAt: now,
          },
        })
      }
    } else if (registrant.memberId && registrant.member) {
      const member = registrant.member
      // A member belongs to at most one group — never re-confirm someone already
      // placed (here or in another group) into a different one.
      if (member.smallGroupId) continue

      await tx.member.update({
        where: { id: registrant.memberId },
        data: { smallGroupId, groupStatus: "Member" },
      })
      await tx.smallGroupLog.create({
        data: {
          smallGroupId,
          action: "MemberAdded",
          memberId: registrant.memberId,
          performedByMemberId: actorMemberId,
          description: `${member.firstName} ${member.lastName} confirmed via Catch Mech${eventName ? ` of ${eventName}` : ""} and joined the group`,
        },
      })
      const updated = await tx.smallGroupMemberRequest.updateMany({
        where: { memberId: registrant.memberId, smallGroupId, status: "Pending" },
        data: { status: "Confirmed", resolvedAt: now, breakoutGroupId },
      })
      if (updated.count === 0) {
        // No pre-existing request — create a confirmed record so the admin page tracks it
        await tx.smallGroupMemberRequest.create({
          data: {
            smallGroupId,
            breakoutGroupId,
            memberId: registrant.memberId,
            status: "Confirmed",
            resolvedAt: now,
          },
        })
      }
    }
  }
}
