"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { matchBreakoutGroups } from "@/lib/matching"
import type { MatchResult } from "@/lib/matching/types"

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function findBreakoutGroupMatches(
  registrantId: string,
  eventId: string
): Promise<ActionResult<MatchResult[]>> {
  try {
    const results = await matchBreakoutGroups(registrantId, eventId, {
      excludeAssigned: true,
      limit: 5,
    })
    return { success: true, data: results }
  } catch {
    return { success: false, error: "Failed to compute breakout matches" }
  }
}

export async function assignRegistrantToBreakout(
  groupId: string,
  registrantId: string,
  eventId: string
): Promise<ActionResult<void>> {
  try {
    const group = await db.breakoutGroup.findUnique({
      where: { id: groupId },
      select: {
        memberLimit: true,
        _count: { select: { members: true } },
      },
    })
    if (!group) return { success: false, error: "Breakout group not found" }
    if (group.memberLimit !== null && group._count.members >= group.memberLimit) {
      return { success: false, error: "This group has reached its capacity" }
    }

    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: groupId, registrantId },
    })

    revalidatePath(`/event/${eventId}/registrants`)
    revalidatePath(`/event/${eventId}/breakouts`)

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to assign registrant to breakout group" }
  }
}
