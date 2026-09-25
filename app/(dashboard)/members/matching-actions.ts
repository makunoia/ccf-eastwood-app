"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import { advancePendingInterest, revalidateInterestEvents } from "@/lib/small-groups/advance-interest"
import { logMembershipMove } from "@/lib/small-groups/membership-log"
import { clearUpwardSatelliteOnConfirm } from "@/lib/small-groups/upward-satellite"
import { matchSmallGroups, matchCouplesGroups, type CoupleMatchResult } from "@/lib/matching"
import type { MatchResult } from "@/lib/matching/types"

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function findSmallGroupMatchesForMember(
  memberId: string,
  options?: {
    scheduleSlot?: { dayOfWeek: number; timeStart: string; timeEnd: string } | null
  }
): Promise<ActionResult<MatchResult[]>> {
  try {
    const results = await matchSmallGroups(
      { memberId },
      {
        excludeCurrentGroup: true,
        limit: 10,
        candidateScheduleSlot: options?.scheduleSlot ?? undefined,
      }
    )
    return { success: true, data: results }
  } catch {
    return { success: false, error: "Failed to compute matches" }
  }
}

export async function findCouplesGroupMatchesForMember(
  memberId: string,
  spouseMemberId: string
): Promise<ActionResult<CoupleMatchResult[]>> {
  try {
    const results = await matchCouplesGroups(
      { memberIdA: memberId, memberIdB: spouseMemberId },
      { limit: 5 }
    )
    return { success: true, data: results }
  } catch {
    return { success: false, error: "Failed to compute couples matches" }
  }
}

export async function assignMemberToSmallGroup(
  memberId: string,
  groupId: string
): Promise<ActionResult<void>> {
  const session = await auth()
  if (!session?.user || !canWrite(session, "SmallGroups")) {
    return { success: false, error: "Unauthorized." }
  }
  try {
    const group = await db.smallGroup.findUnique({
      where: { id: groupId },
      select: {
        status: true,
        memberLimit: true,
        _count: { select: { members: true } },
      },
    })
    if (!group) return { success: false, error: "Group not found" }
    if (group.memberLimit !== null && group._count.members >= group.memberLimit) {
      return {
        success: false,
        error: `This group has reached its member limit of ${group.memberLimit}`,
      }
    }

    const interestEventId = await db.$transaction(async (tx) => {
      const member = await tx.member.findUnique({
        where: { id: memberId }, select: { smallGroupId: true, firstName: true, lastName: true },
      })
      if (!member || member.smallGroupId) throw new Error("Member's DGroup details changed")
      await tx.member.update({
        where: { id: memberId },
        data: { smallGroupId: groupId, groupStatus: "Member" },
      })
      if (group.status === "Pending") {
        await tx.smallGroup.update({ where: { id: groupId }, data: { status: "Active" } })
      }
      const interest = await advancePendingInterest(tx, {
        person: { memberId }, groupId, status: "Confirmed", actorId: session.user.id ?? null,
      })
      await clearUpwardSatelliteOnConfirm(tx, [memberId])
      await logMembershipMove(tx, {
        memberId, memberName: `${member.firstName} ${member.lastName}`,
        fromGroupId: null, toGroupId: groupId,
        actor: { userId: session.user.id ?? null },
        context: interest ? "from an event DGroup interest request" : undefined,
      })
      return interest?.sourceEventId
    })

    revalidatePath(`/members/${memberId}`)
    revalidatePath(`/small-groups/${groupId}`)
    revalidatePath("/small-groups")
    revalidateInterestEvents([interestEventId])

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to assign member to group" }
  }
}
