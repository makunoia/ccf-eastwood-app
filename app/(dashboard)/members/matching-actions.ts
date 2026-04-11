"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { matchSmallGroups } from "@/lib/matching"
import type { MatchResult } from "@/lib/matching/types"

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function findSmallGroupMatchesForMember(
  memberId: string
): Promise<ActionResult<MatchResult[]>> {
  try {
    const results = await matchSmallGroups(
      { memberId },
      { excludeCurrentGroup: true, limit: 5 }
    )
    return { success: true, data: results }
  } catch {
    return { success: false, error: "Failed to compute matches" }
  }
}

export async function assignMemberToSmallGroup(
  memberId: string,
  groupId: string
): Promise<ActionResult<void>> {
  try {
    const group = await db.smallGroup.findUnique({
      where: { id: groupId },
      select: {
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

    const firstStatus = await db.smallGroupStatus.findFirst({
      orderBy: { order: "asc" },
      select: { id: true },
    })

    await db.member.update({
      where: { id: memberId },
      data: { smallGroupId: groupId, smallGroupStatusId: firstStatus?.id ?? null },
    })

    revalidatePath(`/members/${memberId}`)
    revalidatePath(`/small-groups/${groupId}`)
    revalidatePath("/small-groups")

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to assign member to group" }
  }
}
