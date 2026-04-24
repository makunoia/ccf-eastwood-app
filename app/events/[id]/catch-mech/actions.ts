"use server"

import { type Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
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

export type ConfirmDecision = { registrantId: string; confirmed: boolean }

export type ConfirmResult =
  | { success: true; requiresGroupName: false }
  | { success: true; requiresGroupName: true }
  | { success: false; error: string }

export async function submitCatchMechConfirmations(
  token: string,
  decisions: ConfirmDecision[]
): Promise<ConfirmResult> {
  const session = await db.catchMechSession.findUnique({
    where: { token },
    select: {
      eventId: true,
      facilitatorVolunteerId: true,
      breakoutGroupId: true,
      facilitator: {
        select: {
          memberId: true,
          member: {
            select: {
              id: true,
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
  const isTimothy = faciMember.ledGroups.length === 0

  if (isTimothy) {
    // Timothy flow — we'll create the group before confirming
    return { success: true, requiresGroupName: true }
  }

  const smallGroup = await db.smallGroup.findFirst({
    where: { leaderId: faciMember.id },
    select: { id: true },
  })
  if (!smallGroup) {
    return { success: false, error: "Could not find your small group" }
  }

  // Pre-fetch all reads outside the transaction
  const { registrantMap, takenEmails } = await prefetchRegistrantData(decisions)

  await db.$transaction(async (tx) => {
    await resolveConfirmations(smallGroup.id, session.breakoutGroupId, decisions, registrantMap, takenEmails, tx)
  }, { timeout: 30000 })

  revalidatePath(`/small-groups/${smallGroup.id}`)
  revalidatePath(`/event/${session.eventId}/catch-mech`)
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

  const session = await db.catchMechSession.findUnique({
    where: { token },
    select: {
      eventId: true,
      facilitatorVolunteerId: true,
      breakoutGroupId: true,
      facilitator: {
        select: {
          memberId: true,
          member: {
            select: {
              id: true,
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

  // Guard: must still be a Timothy (no leading group)
  if (faciMember.ledGroups.length > 0) {
    return { success: false, error: "You already lead a small group" }
  }

  // Pre-fetch all reads outside the transaction
  const { registrantMap, takenEmails } = await prefetchRegistrantData(decisions)

  try {
    await db.$transaction(async (tx) => {
      // Create the small group
      const created = await tx.smallGroup.create({
        data: { name: groupName.trim(), leaderId: faciMember.id },
        select: { id: true },
      })

      await tx.smallGroupLog.create({
        data: {
          smallGroupId: created.id,
          action: "GroupCreated",
          description: `Group "${groupName.trim()}" was created via Catch Mech`,
        },
      })

      // Link the breakout group to the newly created small group
      await tx.breakoutGroup.update({
        where: { id: session.breakoutGroupId },
        data: { linkedSmallGroupId: created.id },
      })

      // Promote the faci's status to Leader in their home group
      await tx.member.update({
        where: { id: faciMember.id },
        data: { groupStatus: "Leader" },
      })

      await resolveConfirmations(created.id, session.breakoutGroupId, decisions, registrantMap, takenEmails, tx)
    }, { timeout: 30000 })

    revalidatePath("/small-groups")
    revalidatePath(`/event/${session.eventId}/catch-mech`)
    revalidatePath(`/event/${session.eventId}/breakouts/${session.breakoutGroupId}`)
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
  smallGroupId: string,
  breakoutGroupId: string,
  decisions: ConfirmDecision[],
  registrantMap: Map<string, FetchedRegistrant>,
  takenEmails: Set<string>,
  tx: Prisma.TransactionClient
): Promise<void> {
  const now = new Date()

  for (const { registrantId, confirmed } of decisions) {
    const registrant = registrantMap.get(registrantId)
    if (!registrant) continue
    if (!registrant.memberId && !registrant.guestId) continue

    if (!confirmed) {
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
          data: { status: "Rejected", resolvedAt: now, breakoutGroupId },
        })
      } else {
        // No pre-existing request (e.g. Timothy's group didn't exist yet at assignment time)
        await tx.smallGroupMemberRequest.create({
          data: {
            smallGroupId,
            breakoutGroupId,
            status: "Rejected",
            resolvedAt: now,
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
          description: `${personName}'s membership was declined via Catch Mech`,
        },
      })
      continue
    }

    if (registrant.guestId && registrant.guest && !registrant.guest.memberId) {
      const guest = registrant.guest
      // Check capacity (must run inside tx to reflect members added earlier in this loop)
      const sg = await tx.smallGroup.findUnique({
        where: { id: smallGroupId },
        select: { memberLimit: true, _count: { select: { members: true } } },
      })
      if (sg?.memberLimit != null && sg._count.members >= sg.memberLimit) continue

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
      await tx.smallGroupLog.create({
        data: {
          smallGroupId,
          action: "MemberAdded",
          memberId: newMember.id,
          description: `${guest.firstName} ${guest.lastName} confirmed via Catch Mech and joined the group`,
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
      if (member.smallGroupId === smallGroupId) continue

      await tx.member.update({
        where: { id: registrant.memberId },
        data: { smallGroupId, groupStatus: "Member" },
      })
      await tx.smallGroupLog.create({
        data: {
          smallGroupId,
          action: "MemberAdded",
          memberId: registrant.memberId,
          description: `${member.firstName} ${member.lastName} confirmed via Catch Mech and joined the group`,
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
