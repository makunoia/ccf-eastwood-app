"use server"

import { matchSmallGroups, matchSmallGroupsWithEscalation } from "@/lib/matching"
import type { MatchResult, EscalationLevel } from "@/lib/matching/types"

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function findSmallGroupMatchesForGuest(
  guestId: string
): Promise<ActionResult<MatchResult[]>> {
  try {
    const results = await matchSmallGroups({ guestId }, { limit: 5 })
    return { success: true, data: results }
  } catch {
    return { success: false, error: "Failed to compute matches" }
  }
}

export async function findSmallGroupMatchesWithEscalation(
  guestId: string
): Promise<ActionResult<EscalationLevel[]>> {
  try {
    // Find the most recent event where this guest has a breakout group assignment
    const { db } = await import("@/lib/db")
    const breakoutMembership = await db.breakoutGroupMember.findFirst({
      where: { registrant: { guestId } },
      orderBy: { assignedAt: "desc" },
      select: {
        registrant: { select: { eventId: true } },
      },
    })

    if (breakoutMembership) {
      const eventId = breakoutMembership.registrant.eventId
      const levels = await matchSmallGroupsWithEscalation(guestId, eventId)
      return { success: true, data: levels }
    }

    // No breakout assignment — fall back to flat match wrapped as Level 3
    const results = await matchSmallGroups({ guestId }, { limit: 5 })
    if (results.length === 0) return { success: true, data: [] }
    return {
      success: true,
      data: [{ level: 3, source: "all-small-groups", matches: results }],
    }
  } catch {
    return { success: false, error: "Failed to compute matches" }
  }
}
