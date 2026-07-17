"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

async function getMemberByToken(token: string) {
  if (!token) return null
  return db.member.findUnique({
    where: { selfServiceToken: token },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      smallGroupId: true,
    },
  })
}

/** Verifies the token belongs to the leader of the given group. */
async function getLedGroup(token: string, groupId: string) {
  const member = await getMemberByToken(token)
  if (!member) return null
  const group = await db.smallGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      leaderId: true,
      memberLimit: true,
      _count: { select: { members: true } },
    },
  })
  if (!group || group.leaderId !== member.id) return null
  return { member, group }
}

function revalidateGroupPages(groupId: string) {
  revalidatePath("/small-groups")
  revalidatePath(`/small-groups/${groupId}`)
}

// ─── My Group (transfer requests) ────────────────────────────────────────────

export async function requestGroupChange(
  token: string,
  toGroupId: string
): Promise<ActionResult> {
  try {
    const member = await getMemberByToken(token)
    if (!member) return { success: false, error: "Invalid or expired link" }

    if (member.smallGroupId === toGroupId) {
      return { success: false, error: "You are already in this group" }
    }

    const toGroup = await db.smallGroup.findUnique({
      where: { id: toGroupId },
      select: {
        id: true,
        name: true,
        status: true,
        memberLimit: true,
        _count: { select: { members: true } },
      },
    })
    if (!toGroup || toGroup.status === "Inactive") {
      return { success: false, error: "Group not found" }
    }
    if (
      toGroup.memberLimit !== null &&
      toGroup._count.members >= toGroup.memberLimit
    ) {
      return { success: false, error: "This group is already full" }
    }

    const existing = await db.smallGroupMemberRequest.findFirst({
      where: { memberId: member.id, status: "Pending" },
      select: { id: true, smallGroupId: true },
    })
    if (existing?.smallGroupId === toGroupId) {
      return {
        success: false,
        error: "You already have a pending request for this group",
      }
    }

    const memberName = `${member.firstName} ${member.lastName}`
    await db.$transaction(async (tx) => {
      // A member can only have one pending request — replace any previous one
      if (existing?.smallGroupId) {
        await tx.smallGroupMemberRequest.update({
          where: { id: existing.id },
          data: { status: "Rejected", resolvedAt: new Date() },
        })
        await tx.smallGroupLog.create({
          data: {
            smallGroupId: existing.smallGroupId,
            action: "TempAssignmentRejected",
            memberId: member.id,
            description: `${memberName} withdrew their request via the member portal`,
          },
        })
      }
      await tx.smallGroupMemberRequest.create({
        data: {
          smallGroupId: toGroupId,
          memberId: member.id,
          fromGroupId: member.smallGroupId,
        },
      })
      await tx.smallGroupLog.create({
        data: {
          smallGroupId: toGroupId,
          action: "TempAssignmentCreated",
          memberId: member.id,
          fromGroupId: member.smallGroupId,
          toGroupId,
          description: `${memberName} requested to ${member.smallGroupId ? "transfer to" : "join"} this group via the member portal (pending leader confirmation)`,
        },
      })
    })

    revalidateGroupPages(toGroupId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to submit request" }
  }
}

export async function cancelGroupChange(
  token: string,
  requestId: string
): Promise<ActionResult> {
  try {
    const member = await getMemberByToken(token)
    if (!member) return { success: false, error: "Invalid or expired link" }

    const request = await db.smallGroupMemberRequest.findUnique({
      where: { id: requestId },
      select: { id: true, memberId: true, smallGroupId: true, status: true },
    })
    if (!request || request.memberId !== member.id) {
      return { success: false, error: "Request not found" }
    }
    if (request.status !== "Pending") {
      return { success: false, error: "This request has already been resolved" }
    }
    // Only a Catch Mech decline is groupless, and those are never Pending.
    const smallGroupId = request.smallGroupId
    if (!smallGroupId) return { success: false, error: "Request not found" }

    await db.$transaction([
      db.smallGroupMemberRequest.update({
        where: { id: request.id },
        data: { status: "Rejected", resolvedAt: new Date() },
      }),
      db.smallGroupLog.create({
        data: {
          smallGroupId,
          action: "TempAssignmentRejected",
          memberId: member.id,
          description: `${member.firstName} ${member.lastName} cancelled their request via the member portal`,
        },
      }),
    ])

    revalidateGroupPages(smallGroupId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to cancel request" }
  }
}

// ─── Led groups: schedule ────────────────────────────────────────────────────

const scheduleSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    timeStart: z.string().regex(/^\d{2}:\d{2}$/, "Invalid start time"),
    timeEnd: z.string().regex(/^\d{2}:\d{2}$/, "Invalid end time"),
  })
  .refine((v) => v.timeStart < v.timeEnd, {
    message: "End time must be after start time",
  })

export async function updateLedGroupSchedule(
  token: string,
  groupId: string,
  raw: { dayOfWeek: number; timeStart: string; timeEnd: string }
): Promise<ActionResult> {
  try {
    const ctx = await getLedGroup(token, groupId)
    if (!ctx) return { success: false, error: "Invalid or expired link" }

    const parsed = scheduleSchema.safeParse(raw)
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid schedule",
      }
    }

    await db.smallGroup.update({
      where: { id: groupId },
      data: {
        scheduleDayOfWeek: parsed.data.dayOfWeek,
        scheduleTimeStart: parsed.data.timeStart,
        scheduleTimeEnd: parsed.data.timeEnd,
      },
    })

    revalidateGroupPages(groupId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update schedule" }
  }
}

// ─── Led groups: roster ──────────────────────────────────────────────────────

export type MemberSearchResult = {
  id: string
  name: string
  currentGroupName: string | null
}

export async function searchMembersToAdd(
  token: string,
  groupId: string,
  query: string
): Promise<ActionResult<{ members: MemberSearchResult[] }>> {
  try {
    const ctx = await getLedGroup(token, groupId)
    if (!ctx) return { success: false, error: "Invalid or expired link" }

    const q = query.trim()
    if (q.length < 2) return { success: true, data: { members: [] } }

    const members = await db.member.findMany({
      where: {
        AND: [
          // `not` alone would also exclude members with no group (NULL)
          { OR: [{ smallGroupId: null }, { smallGroupId: { not: groupId } }] },
          {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { nickname: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        smallGroup: { select: { name: true } },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 10,
    })

    return {
      success: true,
      data: {
        members: members.map((m) => ({
          id: m.id,
          name: `${m.firstName} ${m.lastName}`,
          currentGroupName: m.smallGroup?.name ?? null,
        })),
      },
    }
  } catch {
    return { success: false, error: "Search failed" }
  }
}

export async function addMemberToLedGroup(
  token: string,
  groupId: string,
  memberId: string
): Promise<ActionResult> {
  try {
    const ctx = await getLedGroup(token, groupId)
    if (!ctx) return { success: false, error: "Invalid or expired link" }
    const { group, member: leader } = ctx

    if (
      group.memberLimit !== null &&
      group._count.members >= group.memberLimit
    ) {
      return {
        success: false,
        error: `This group has reached its member limit of ${group.memberLimit}`,
      }
    }

    const target = await db.member.findUnique({
      where: { id: memberId },
      select: {
        firstName: true,
        lastName: true,
        smallGroupId: true,
        smallGroup: { select: { name: true } },
      },
    })
    if (!target) return { success: false, error: "Member not found" }
    if (target.smallGroupId === groupId) {
      return { success: false, error: "This member is already in your group" }
    }

    const targetName = `${target.firstName} ${target.lastName}`
    const leaderName = `${leader.firstName} ${leader.lastName}`
    const fromGroupId = target.smallGroupId

    await db.$transaction([
      db.member.update({
        where: { id: memberId },
        data: { smallGroupId: groupId, groupStatus: "Member" },
      }),
      db.smallGroupLog.create({
        data: {
          smallGroupId: groupId,
          action: fromGroupId ? "MemberTransferred" : "MemberAdded",
          memberId,
          fromGroupId,
          toGroupId: fromGroupId ? groupId : null,
          description: fromGroupId
            ? `${targetName} was transferred from ${target.smallGroup?.name ?? "another group"} by ${leaderName} via the member portal`
            : `${targetName} was added to the group by ${leaderName} via the member portal`,
        },
      }),
    ])

    revalidateGroupPages(groupId)
    if (fromGroupId) revalidatePath(`/small-groups/${fromGroupId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to add member" }
  }
}

export async function removeMemberFromLedGroup(
  token: string,
  groupId: string,
  memberId: string
): Promise<ActionResult> {
  try {
    const ctx = await getLedGroup(token, groupId)
    if (!ctx) return { success: false, error: "Invalid or expired link" }
    const { member: leader } = ctx

    const target = await db.member.findUnique({
      where: { id: memberId },
      select: { firstName: true, lastName: true, smallGroupId: true },
    })
    if (!target || target.smallGroupId !== groupId) {
      return { success: false, error: "This member is not in your group" }
    }

    await db.$transaction([
      db.member.update({
        where: { id: memberId },
        data: { smallGroupId: null, groupStatus: null },
      }),
      db.smallGroupLog.create({
        data: {
          smallGroupId: groupId,
          action: "MemberRemoved",
          memberId,
          description: `${target.firstName} ${target.lastName} was removed from the group by ${leader.firstName} ${leader.lastName} via the member portal`,
        },
      }),
    ])

    revalidateGroupPages(groupId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to remove member" }
  }
}
