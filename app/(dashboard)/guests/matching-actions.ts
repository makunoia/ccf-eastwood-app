"use server"

import { matchSmallGroups, matchSmallGroupsWithEscalation } from "@/lib/matching"
import { db } from "@/lib/db"
import type { MatchResult, EscalationLevel } from "@/lib/matching/types"

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

type SmallGroupDetails = {
  id: string
  name: string
  leader: { firstName: string; lastName: string } | null
  lifeStage: { name: string } | null
  genderFocus: "Male" | "Female" | "Mixed" | null
  language: string[]
  locationCity: string | null
  meetingFormat: "Online" | "Hybrid" | "InPerson" | null
  memberLimit: number | null
  scheduleDayOfWeek: number | null
  scheduleTimeStart: string | null
  members: {
    id: string
    firstName: string
    lastName: string
    groupStatus: "Member" | "Timothy" | "Leader" | null
  }[]
  currentCount: number
}

export async function getSmallGroupDetails(
  groupId: string
): Promise<ActionResult<SmallGroupDetails>> {
  try {
    const group = await db.smallGroup.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        name: true,
        leader: { select: { firstName: true, lastName: true } },
        lifeStage: { select: { name: true } },
        genderFocus: true,
        language: true,
        locationCity: true,
        meetingFormat: true,
        memberLimit: true,
        scheduleDayOfWeek: true,
        scheduleTimeStart: true,
        members: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            groupStatus: true,
          },
        },
      },
    })

    if (!group) {
      return { success: false, error: "Small group not found" }
    }

    return {
      success: true,
      data: {
        ...group,
        currentCount: group.members.length,
      },
    }
  } catch {
    return { success: false, error: "Failed to load small group details" }
  }
}

export async function findSmallGroupMatchesForGuest(
  guestId: string
): Promise<ActionResult<MatchResult[]>> {
  try {
    const results = await matchSmallGroups({ guestId }, { limit: 10 })
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
    const results = await matchSmallGroups({ guestId }, { limit: 10 })
    if (results.length === 0) return { success: true, data: [] }
    return {
      success: true,
      data: [{ level: 3, source: "all-small-groups", matches: results }],
    }
  } catch {
    return { success: false, error: "Failed to compute matches" }
  }
}
