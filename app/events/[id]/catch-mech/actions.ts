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

  await db.$transaction(async (tx) => {
    await resolveConfirmations(smallGroup.id, decisions, session.breakoutGroupId, tx)
  })

  revalidatePath(`/small-groups/${smallGroup.id}`)
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

      // Promote the faci's status to Leader in their home group
      await tx.member.update({
        where: { id: faciMember.id },
        data: { groupStatus: "Leader" },
      })

      await resolveConfirmations(created.id, decisions, session.breakoutGroupId, tx)
    })

    revalidatePath("/small-groups")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to create small group" }
  }
}

// ─── Shared confirmation resolver ────────────────────────────────────────────

async function resolveConfirmations(
  smallGroupId: string,
  decisions: ConfirmDecision[],
  _breakoutGroupId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  for (const { registrantId, confirmed } of decisions) {
    const registrant = await tx.eventRegistrant.findUnique({
      where: { id: registrantId },
      select: {
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
      },
    })
    if (!registrant) continue
    if (!registrant.memberId && !registrant.guestId) continue

    const now = new Date()

    if (!confirmed) {
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
        const personName = registrant.member
          ? `${registrant.member.firstName} ${registrant.member.lastName}`
          : registrant.guest
            ? `${registrant.guest.firstName} ${registrant.guest.lastName}`
            : "Unknown"
        await tx.smallGroupMemberRequest.update({
          where: { id: pendingRequest.id },
          data: { status: "Rejected", resolvedAt: now },
        })
        await tx.smallGroupLog.create({
          data: {
            smallGroupId,
            action: "TempAssignmentRejected",
            guestId: registrant.guestId ?? null,
            memberId: registrant.memberId ?? null,
            description: `${personName}'s membership was declined via Catch Mech`,
          },
        })
      }
      continue
    }

    if (registrant.guestId && registrant.guest && !registrant.guest.memberId) {
      const guest = registrant.guest
      // Check capacity
      const sg = await tx.smallGroup.findUnique({
        where: { id: smallGroupId },
        select: { memberLimit: true, _count: { select: { members: true } } },
      })
      if (sg?.memberLimit !== null && sg!._count.members >= sg!.memberLimit!) continue

      const newMember = await tx.member.create({
        data: {
          firstName: guest.firstName,
          lastName: guest.lastName,
          email: guest.email ?? null,
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
          ...(guest.scheduleDayOfWeek !== null &&
          guest.scheduleTimeStart !== null
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

      // Resolve any existing SmallGroupMemberRequest
      await tx.smallGroupMemberRequest.updateMany({
        where: { guestId: registrant.guestId, smallGroupId, status: "Pending" },
        data: { status: "Confirmed", resolvedAt: now },
      })
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

      await tx.smallGroupMemberRequest.updateMany({
        where: { memberId: registrant.memberId, smallGroupId, status: "Pending" },
        data: { status: "Confirmed", resolvedAt: now },
      })
    }
  }
}
