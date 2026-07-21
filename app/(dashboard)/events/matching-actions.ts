"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { matchBreakoutGroups } from "@/lib/matching"
import type { MatchResult } from "@/lib/matching/types"
import { tryCreateSmallGroupRequestFromBreakout } from "@/lib/create-small-group-request"

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export type BreakoutGroupDetails = {
  id: string
  name: string
  facilitator: { firstName: string; lastName: string } | null
  coFacilitator: { firstName: string; lastName: string } | null
  lifeStages: { name: string }[]
  genderFocus: "Male" | "Female" | "Mixed" | null
  language: string[]
  locationCity: string | null
  meetingFormat: "Online" | "Hybrid" | "InPerson" | null
  memberLimit: number | null
  schedules: { dayOfWeek: number; timeStart: string; timeEnd: string | null }[]
  members: { id: string; name: string }[]
  currentCount: number
}

/**
 * Fetches one breakout group's details for the match-result drawer. Scoped by
 * `{ id, eventId }` — a groupId from another event resolves to null (404),
 * which is the authz boundary for this event-scoped entity.
 */
export async function getBreakoutGroupDetails(
  groupId: string,
  eventId: string
): Promise<ActionResult<BreakoutGroupDetails>> {
  try {
    const g = await db.breakoutGroup.findFirst({
      where: { id: groupId, eventId },
      select: {
        id: true,
        name: true,
        genderFocus: true,
        language: true,
        locationCity: true,
        meetingFormat: true,
        memberLimit: true,
        lifeStages: { select: { name: true }, orderBy: { order: "asc" } },
        schedules: {
          select: { dayOfWeek: true, timeStart: true, timeEnd: true },
          orderBy: [{ dayOfWeek: "asc" }, { timeStart: "asc" }],
        },
        facilitator: { select: { member: { select: { firstName: true, lastName: true } } } },
        coFacilitator: { select: { member: { select: { firstName: true, lastName: true } } } },
        members: {
          orderBy: { assignedAt: "asc" },
          select: {
            registrant: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                member: { select: { firstName: true, lastName: true } },
                guest: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
    })

    if (!g) return { success: false, error: "Breakout group not found" }

    const members = g.members.map((m) => {
      const r = m.registrant
      const name = r.member
        ? `${r.member.firstName} ${r.member.lastName}`
        : r.guest
        ? `${r.guest.firstName} ${r.guest.lastName}`
        : [r.firstName, r.lastName].filter(Boolean).join(" ") || "Unknown"
      return { id: r.id, name }
    })

    return {
      success: true,
      data: {
        id: g.id,
        name: g.name,
        facilitator: g.facilitator?.member ?? null,
        coFacilitator: g.coFacilitator?.member ?? null,
        lifeStages: g.lifeStages,
        genderFocus: g.genderFocus,
        language: g.language,
        locationCity: g.locationCity,
        meetingFormat: g.meetingFormat,
        memberLimit: g.memberLimit,
        schedules: g.schedules,
        members,
        currentCount: members.length,
      },
    }
  } catch {
    return { success: false, error: "Failed to load breakout group details" }
  }
}

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
    await tryCreateSmallGroupRequestFromBreakout(groupId, registrantId)

    revalidatePath(`/event/${eventId}/registrants`)
    revalidatePath(`/event/${eventId}/breakouts`)

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to assign registrant to breakout group" }
  }
}
