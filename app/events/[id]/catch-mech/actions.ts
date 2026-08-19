"use server"

import { db } from "@/lib/db"
import { resolveCatchMechTargets } from "@/lib/catch-mech/targets"
import { resolveCatchMechScope } from "@/lib/catch-mech/scope"
import {
  STAFFING_SELECT,
  mintFaciSession,
  staffVolunteerFor,
} from "@/lib/catch-mech/faci-session"
import {
  prefetchRegistrantData,
  resolveConfirmations,
} from "@/lib/catch-mech/confirmations"
import {
  resolveTargets,
  validateDecisions,
  validateTargets,
  type ConfirmDecision,
} from "@/lib/catch-mech/decisions"
import {
  recordConfirmationSubmission,
  submitterName,
  tallyDecisions,
} from "@/lib/catch-mech/submission-log"
import { revalidatePath } from "next/cache"
import { formatPhilippinePhone } from "@/lib/utils"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * Cache invalidation is a post-commit courtesy, never a reason to tell a faci their
 * submission failed. Letting it throw would also reject the action's promise, which
 * strands the public form on "Submitting…" — the exact failure this guards.
 */
function safeRevalidate(paths: () => void, label: string): void {
  try {
    paths()
  } catch (err) {
    console.error(`[${label}] revalidation failed after commit`, err)
  }
}

// ─── Faci identity verification ──────────────────────────────────────────────

export async function verifyCatchMechFaci(
  eventId: string,
  breakoutGroupId: string,
  mobile: string
): Promise<ActionResult<{ token: string }>> {
  if (!mobile.trim()) {
    return { success: false, error: "Mobile number is required" }
  }

  try {
    const member = await db.member.findFirst({
      where: { phone: formatPhilippinePhone(mobile.trim()) },
      select: { id: true },
    })
    if (!member) {
      return { success: false, error: "No member found with that mobile number" }
    }

    // Scoped, not a bare point read: this used to accept ANY breakout group id
    // from any event. Scoping both closes that and is what lets a Collab day's
    // cluster-owned tables resolve here at all.
    const scope = await resolveCatchMechScope(eventId)
    const breakoutGroup = await db.breakoutGroup.findFirst({
      where: { AND: [{ id: breakoutGroupId }, scope.where] },
      // Substitutes count: Catch Mech is about the table's people, not one
      // sitting, so whoever stood in for it can answer for it.
      // `resolveCatchMechTargets` already sends anyone who is not the lead to
      // their own DGroup, which is the right rule for a stand-in.
      select: STAFFING_SELECT,
    })
    if (!breakoutGroup) {
      return { success: false, error: "Breakout group not found" }
    }

    const faci = staffVolunteerFor(breakoutGroup, member.id)
    if (!faci) {
      return {
        success: false,
        error: "You are not registered as a facilitator for this group",
      }
    }

    const token = await mintFaciSession(eventId, breakoutGroupId, faci.id)
    return { success: true, data: { token } }
  } catch (err) {
    console.error("[verifyCatchMechFaci]", err)
    return { success: false, error: "Could not verify your mobile number. Please try again." }
  }
}

// ─── Submit confirmations ─────────────────────────────────────────────────────

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

  // Everything below runs inside the catch — the session lookup and the registrant
  // prefetch are as capable of failing as the write is, and a throw out of a server
  // action rejects its promise, which the caller cannot recover from.
  try {
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
      return await persistGrouplessDeclines(session, decisions)
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
        session.facilitator.member.id,
        "Catch Mech"
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

    safeRevalidate(() => {
      for (const groupId of touchedGroupIds) revalidatePath(`/small-groups/${groupId}`)
      revalidatePath(`/event/${session.eventId}/catch-mech`, "layout")
      revalidatePath(`/event/${session.eventId}/dashboard`)
    }, "submitCatchMechConfirmations")

    return { success: true, requiresGroupName: false }
  } catch (err) {
    console.error("[submitCatchMechConfirmations]", err)
    return { success: false, error: "Could not save your confirmations. Please try again." }
  }
}

/**
 * Records declines made by a faci who leads no group yet. Without a group there is
 * nothing to join, so only the rejection and its reason are kept — scoped to the
 * declining faci so a co-faci's list is untouched.
 *
 * Called from inside submitCatchMechConfirmations' try, so throws surface there.
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

  safeRevalidate(() => {
    revalidatePath(`/event/${session.eventId}/catch-mech`, "layout")
    revalidatePath(`/event/${session.eventId}/dashboard`)
  }, "persistGrouplessDeclines")

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

  let newGroupId: string | null = null
  let eventId: string | null = null
  let breakoutGroupId: string | null = null
  let faciMemberId: string | null = null

  try {
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
    eventId = session.eventId
    breakoutGroupId = session.breakoutGroupId
    faciMemberId = faciMember.id
    // The breakout's linked group belongs to the LEAD facilitator. A co-facilitator
    // creating their own group must not overwrite the lead's breakout link.
    const isLeadFaci = session.facilitatorVolunteerId === session.breakoutGroup.facilitatorId

    // Guard: must still be a Timothy (no leading group)
    if (faciMember.ledGroups.length > 0) {
      return { success: false, error: "You already lead a DGroup" }
    }

    // Pre-fetch all reads outside the transaction
    const [event, { registrantMap, takenEmails }] = await Promise.all([
      db.event.findUnique({ where: { id: session.eventId }, select: { name: true } }),
      prefetchRegistrantData(decisions),
    ])
    const eventName = event?.name ?? null

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
        faciMember.id,
        "Catch Mech"
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
  } catch (err) {
    console.error("[createSmallGroupForTimothy]", err)
    return { success: false, error: "Failed to create DGroup" }
  }

  // Past the commit: the group exists, so nothing below may turn this into a failure.
  // Auto-linking other breakouts is a convenience, and reporting failure here would
  // send the faci back to a name step that now rejects them ("You already lead a
  // DGroup") — stranding them with no way forward.
  try {
    if (newGroupId && faciMemberId && breakoutGroupId) {
      // Auto-link other breakout groups where this member is the LEAD facilitator across
      // all events — linkedSmallGroupId always represents the lead faci's group.
      const otherBreakouts = await db.breakoutGroup.findMany({
        where: {
          linkedSmallGroupId: null,
          id: { not: breakoutGroupId },
          facilitator: { memberId: faciMemberId },
        },
        select: { id: true, eventId: true },
      })
      if (otherBreakouts.length > 0) {
        await db.breakoutGroup.updateMany({
          where: { id: { in: otherBreakouts.map((b) => b.id) } },
          data: { linkedSmallGroupId: newGroupId },
        })
        const otherEventIds = [...new Set(otherBreakouts.map((b) => b.eventId))]
        safeRevalidate(() => {
          for (const eid of otherEventIds) {
            revalidatePath(`/event/${eid}/breakouts`)
            revalidatePath(`/event/${eid}/catch-mech`, "layout")
            revalidatePath(`/event/${eid}/dashboard`)
          }
        }, "createSmallGroupForTimothy")
      }
    }
  } catch (err) {
    console.error("[createSmallGroupForTimothy] post-commit auto-link failed", err)
  }

  safeRevalidate(() => {
    revalidatePath("/small-groups")
    revalidatePath(`/event/${eventId}/catch-mech`, "layout")
    revalidatePath(`/event/${eventId}/breakouts/${breakoutGroupId}`)
    revalidatePath(`/event/${eventId}/dashboard`)
  }, "createSmallGroupForTimothy")

  return { success: true, data: undefined }
}
