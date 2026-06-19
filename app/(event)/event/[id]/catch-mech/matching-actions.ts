"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import { matchSmallGroups } from "@/lib/matching"
import { scoreGroup } from "@/lib/matching/engine"
import { scoreGender, scoreLifeStage, scoreSchedule } from "@/lib/matching/scorers"
import { DEFAULT_WEIGHTS } from "@/lib/validations/matching-weights"
import { MatchingContext } from "@/app/generated/prisma/client"
import type { MatchResult, CandidateProfile } from "@/lib/matching/types"

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

// Volunteer info attached to each match when scope = "volunteers"
export type VolunteerInfo = {
  committeeName: string
  roleName: string // assignedRole ?? preferredRole
}

export type CatchMechMatchResult = MatchResult & {
  volunteerInfo?: VolunteerInfo
}

export type CatchMechEscalationLevel = {
  level: 1 | 2 | 3
  source: "event-volunteers" | "all-small-groups"
  matches: CatchMechMatchResult[]
}

// ─── Build candidate profile from registrantId ───────────────────────────────

async function buildCandidateForRegistrant(
  registrantId: string
): Promise<CandidateProfile | null> {
  const registrant = await db.eventRegistrant.findUnique({
    where: { id: registrantId },
    select: {
      guest: {
        select: {
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
      member: {
        select: {
          lifeStageId: true,
          gender: true,
          language: true,
          birthMonth: true,
          birthYear: true,
          workCity: true,
          workIndustry: true,
          meetingPreference: true,
          schedulePreferences: {
            select: { dayOfWeek: true, timeStart: true },
          },
        },
      },
    },
  })

  if (!registrant) return null

  function addOneHour(time: string): string {
    const [h, m] = time.split(":").map(Number)
    return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  }

  if (registrant.guest) {
    const g = registrant.guest
    return {
      lifeStageId: g.lifeStageId,
      gender: g.gender,
      language: g.language,
      birthMonth: g.birthMonth,
      birthYear: g.birthYear,
      workCity: g.workCity,
      workIndustry: g.workIndustry,
      meetingPreference: g.meetingPreference,
      scheduleSlots:
        g.scheduleDayOfWeek !== null && g.scheduleTimeStart !== null
          ? [{ dayOfWeek: g.scheduleDayOfWeek, timeStart: g.scheduleTimeStart, timeEnd: addOneHour(g.scheduleTimeStart) }]
          : [],
    }
  }

  if (registrant.member) {
    const m = registrant.member
    return {
      lifeStageId: m.lifeStageId,
      gender: m.gender,
      language: m.language,
      birthMonth: m.birthMonth,
      birthYear: m.birthYear,
      workCity: m.workCity,
      workIndustry: m.workIndustry,
      meetingPreference: m.meetingPreference,
      scheduleSlots: m.schedulePreferences.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        timeStart: s.timeStart,
        timeEnd: addOneHour(s.timeStart),
      })),
    }
  }

  return null
}

// ─── findCatchMechSmallGroupMatches ──────────────────────────────────────────

export async function findCatchMechSmallGroupMatches(
  registrantId: string,
  eventId: string,
  scope: "volunteers" | "all"
): Promise<ActionResult<CatchMechEscalationLevel[]>> {
  try {
    const candidate = await buildCandidateForRegistrant(registrantId)
    if (!candidate) {
      return { success: false, error: "Registrant not found" }
    }

    const weightConfig = await db.matchingWeightConfig.findUnique({
      where: { context: MatchingContext.SmallGroup },
    })
    const weights = weightConfig ?? DEFAULT_WEIGHTS

    function addOneHour(time: string): string {
      const [h, m] = time.split(":").map(Number)
      return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    }

    if (scope === "volunteers") {
      // Fetch confirmed volunteers who lead a small group
      const volunteers = await db.volunteer.findMany({
        where: {
          eventId,
          status: "Confirmed",
          member: { ledGroups: { some: {} } },
        },
        select: {
          memberId: true,
          committee: { select: { name: true } },
          assignedRole: { select: { name: true } },
          preferredRole: { select: { name: true } },
          member: {
            select: {
              ledGroups: {
                select: { id: true },
              },
            },
          },
        },
      })

      // Map smallGroupId → VolunteerInfo (first volunteer found leads that group)
      const volunteerInfoMap = new Map<string, VolunteerInfo>()
      const volunteerGroupIds: string[] = []

      for (const v of volunteers) {
        for (const group of v.member.ledGroups) {
          if (!volunteerInfoMap.has(group.id)) {
            volunteerInfoMap.set(group.id, {
              committeeName: v.committee.name,
              roleName: v.assignedRole?.name ?? v.preferredRole.name,
            })
            volunteerGroupIds.push(group.id)
          }
        }
      }

      if (volunteerGroupIds.length === 0) {
        return { success: true, data: [] }
      }

      const SMALL_GROUP_SCORE_SELECT = {
        id: true,
        name: true,
        lifeStages: { select: { id: true } },
        genderFocus: true,
        language: true,
        ageRangeMin: true,
        ageRangeMax: true,
        meetingFormat: true,
        locationCity: true,
        memberLimit: true,
        scheduleDayOfWeek: true,
        scheduleTimeStart: true,
        _count: { select: { members: true } },
        members: { select: { workIndustry: true } },
      } as const

      const groups = await db.smallGroup.findMany({
        where: { id: { in: volunteerGroupIds } },
        select: SMALL_GROUP_SCORE_SELECT,
      })

      const eligible = groups.filter((g) => {
        if (g.memberLimit !== null && g._count.members >= g.memberLimit) return false
        const scheduleSlots =
          g.scheduleDayOfWeek !== null && g.scheduleTimeStart !== null
            ? [{ dayOfWeek: g.scheduleDayOfWeek, timeStart: g.scheduleTimeStart, timeEnd: addOneHour(g.scheduleTimeStart) }]
            : []
        if (scoreGender(candidate.gender, g.genderFocus) === 0.0) return false
        if (scoreLifeStage(candidate.lifeStageId, g.lifeStages.map((ls) => ls.id)) === 0.0) return false
        if (scheduleSlots.length > 0 && scoreSchedule(candidate.scheduleSlots, scheduleSlots) === 0.0) return false
        return true
      })

      const scored: CatchMechMatchResult[] = eligible
        .map((g) => {
          const memberIndustries = g.members
            .map((m) => m.workIndustry)
            .filter((i): i is string => i != null)
          const profile = {
            id: g.id,
            name: g.name,
            lifeStageIds: g.lifeStages.map((ls) => ls.id),
            genderFocus: g.genderFocus,
            language: g.language,
            ageRangeMin: g.ageRangeMin,
            ageRangeMax: g.ageRangeMax,
            meetingFormat: g.meetingFormat,
            locationCity: g.locationCity,
            memberLimit: g.memberLimit,
            currentCount: g._count.members,
            memberIndustries,
            scheduleSlots:
              g.scheduleDayOfWeek !== null && g.scheduleTimeStart !== null
                ? [{ dayOfWeek: g.scheduleDayOfWeek, timeStart: g.scheduleTimeStart, timeEnd: addOneHour(g.scheduleTimeStart) }]
                : [],
          }
          const result = scoreGroup(candidate, profile, weights)
          return {
            ...result,
            volunteerInfo: volunteerInfoMap.get(g.id),
          }
        })
        .sort((a, b) => b.totalScore - a.totalScore)

      if (scored.length === 0) return { success: true, data: [] }
      return {
        success: true,
        data: [{ level: 1, source: "event-volunteers", matches: scored }],
      }
    }

    // scope === "all"
    const registrant = await db.eventRegistrant.findUnique({
      where: { id: registrantId },
      select: { guestId: true, memberId: true },
    })
    if (!registrant) return { success: false, error: "Registrant not found" }

    let results: MatchResult[]
    if (registrant.guestId) {
      results = await matchSmallGroups({ guestId: registrant.guestId }, { limit: 10 })
    } else if (registrant.memberId) {
      results = await matchSmallGroups({ memberId: registrant.memberId }, { limit: 10 })
    } else {
      results = []
    }

    if (results.length === 0) return { success: true, data: [] }
    return {
      success: true,
      data: [{ level: 3, source: "all-small-groups", matches: results }],
    }
  } catch {
    return { success: false, error: "Failed to compute matches" }
  }
}

// ─── addCatchMechComment ─────────────────────────────────────────────────────

export async function addCatchMechComment(
  requestId: string,
  text: string
): Promise<ActionResult<void>> {
  const session = await auth()
  const authorId = session?.user?.id
  if (!authorId) return { success: false, error: "Not authenticated" }
  if (!text.trim()) return { success: false, error: "Comment cannot be empty" }
  try {
    await db.catchMechComment.create({
      data: { requestId, authorId, text: text.trim() },
    })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to add comment" }
  }
}

// ─── assignCatchMechRegistrantToGroup ────────────────────────────────────────

export async function assignCatchMechRegistrantToGroup(
  registrantId: string,
  eventId: string,
  groupId: string
): Promise<ActionResult<void>> {
  try {
    const registrant = await db.eventRegistrant.findUnique({
      where: { id: registrantId },
      select: { guestId: true, memberId: true },
    })
    if (!registrant) return { success: false, error: "Registrant not found" }

    // Find the event's breakout group IDs to scope the lookup
    const eventBreakoutGroups = await db.breakoutGroup.findMany({
      where: { eventId },
      select: { id: true },
    })
    const breakoutGroupIds = eventBreakoutGroups.map((bg) => bg.id)

    // Find existing Rejected request for this registrant in this event
    const existing = await db.smallGroupMemberRequest.findFirst({
      where: {
        status: "Rejected",
        breakoutGroupId: { in: breakoutGroupIds },
        ...(registrant.guestId ? { guestId: registrant.guestId } : { memberId: registrant.memberId }),
      },
    })

    if (existing) {
      await db.smallGroupMemberRequest.update({
        where: { id: existing.id },
        data: {
          status: "Pending",
          smallGroupId: groupId,
          resolvedAt: null,
        },
      })
    } else {
      // Edge case: create new Pending request
      await db.smallGroupMemberRequest.create({
        data: {
          status: "Pending",
          smallGroupId: groupId,
          guestId: registrant.guestId ?? undefined,
          memberId: registrant.memberId ?? undefined,
          breakoutGroupId: breakoutGroupIds[0] ?? undefined,
        },
      })
    }

    revalidatePath(`/event/${eventId}/catch-mech/rejected`)
    revalidatePath(`/event/${eventId}/catch-mech/rejected/${registrantId}`)
    revalidatePath(`/event/${eventId}/catch-mech/pending`)

    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to assign to group" }
  }
}

// ─── reopenCatchMechRequest (admin undo of a confirm/reject decision) ─────────

export async function reopenCatchMechRequest(
  requestId: string,
  eventId: string
): Promise<ActionResult<void>> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Not authenticated." }
  if (!canWrite(session, "SmallGroups")) return { success: false, error: "Unauthorized." }
  const actorId = session.user.id ?? null

  try {
    const request = await db.smallGroupMemberRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        status: true,
        smallGroupId: true,
        memberId: true,
        guestId: true,
        member: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            guest: { select: { id: true } },
          },
        },
      },
    })
    if (!request) return { success: false, error: "Request not found" }
    if (request.status !== "Confirmed" && request.status !== "Rejected") {
      return { success: false, error: "Only confirmed or rejected decisions can be undone" }
    }

    await db.$transaction(async (tx) => {
      // ── Rejected → Pending: simply reopen the request ──────────────────────
      if (request.status === "Rejected") {
        await tx.smallGroupMemberRequest.update({
          where: { id: request.id },
          data: { status: "Pending", resolvedAt: null, declineReason: null, notes: null },
        })
        await tx.smallGroupLog.create({
          data: {
            smallGroupId: request.smallGroupId,
            action: "TempAssignmentCreated",
            memberId: request.memberId ?? null,
            guestId: request.guestId ?? null,
            performedByUserId: actorId,
            description: "Rejection reopened by admin (pending leader confirmation)",
          },
        })
        return
      }

      // ── Confirmed → full reversal ──────────────────────────────────────────
      const member = request.member
      if (member?.guest) {
        // Promoted guest: undo the promotion entirely and restore the guest.
        const guestId = member.guest.id
        await tx.guest.update({ where: { id: guestId }, data: { memberId: null } })
        await tx.eventRegistrant.updateMany({
          where: { memberId: member.id },
          data: { guestId, memberId: null },
        })
        // Clear the request's memberId BEFORE deleting the member — the FK cascades.
        await tx.smallGroupMemberRequest.update({
          where: { id: request.id },
          data: { status: "Pending", resolvedAt: null, guestId, memberId: null },
        })
        await tx.smallGroupLog.create({
          data: {
            smallGroupId: request.smallGroupId,
            action: "MemberRemoved",
            guestId,
            performedByUserId: actorId,
            description: `${member.firstName} ${member.lastName}'s confirmation was undone — restored to guest`,
          },
        })
        await tx.member.delete({ where: { id: member.id } })
        return
      }

      // Already a real member: remove from the group, keep the member record.
      if (member) {
        await tx.member.update({
          where: { id: member.id },
          data: { smallGroupId: null, groupStatus: null },
        })
        await tx.smallGroupMemberRequest.update({
          where: { id: request.id },
          data: { status: "Pending", resolvedAt: null },
        })
        await tx.smallGroupLog.create({
          data: {
            smallGroupId: request.smallGroupId,
            action: "MemberRemoved",
            memberId: member.id,
            performedByUserId: actorId,
            description: `${member.firstName} ${member.lastName}'s confirmation was undone — removed from the group`,
          },
        })
      }
    })

    revalidatePath(`/event/${eventId}/catch-mech`, "layout")
    revalidatePath(`/event/${eventId}/dashboard`)
    revalidatePath(`/event/${eventId}/breakouts`)
    revalidatePath("/small-groups")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to undo decision" }
  }
}
