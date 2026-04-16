import { db } from "@/lib/db"
import { MatchingContext } from "@/app/generated/prisma/client"
import { DEFAULT_WEIGHTS } from "@/lib/validations/matching-weights"
import { scoreGroup } from "./engine"
import { EMPTY_CANDIDATE } from "./types"
import type { CandidateProfile, GroupProfile, MatchResult, WeightConfig, EscalationLevel } from "./types"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildCandidateFromMember(m: {
  lifeStageId: string | null
  gender: "Male" | "Female" | null
  language: string[]
  birthDate: Date | null
  workCity: string | null
  workIndustry: string | null
  meetingPreference: "Online" | "Hybrid" | "InPerson" | null
  schedulePreferences: { dayOfWeek: number; timeStart: string; timeEnd: string }[]
}): CandidateProfile {
  return {
    lifeStageId: m.lifeStageId,
    gender: m.gender,
    language: m.language,
    birthDate: m.birthDate,
    workCity: m.workCity,
    workIndustry: m.workIndustry,
    meetingPreference: m.meetingPreference,
    scheduleSlots: m.schedulePreferences,
  }
}

function buildCandidateFromGuest(g: {
  lifeStageId: string | null
  gender: "Male" | "Female" | null
  language: string[]
  birthDate: Date | null
  workCity: string | null
  workIndustry: string | null
  meetingPreference: "Online" | "Hybrid" | "InPerson" | null
  scheduleDayOfWeek: number | null
  scheduleTimeStart: string | null
  scheduleTimeEnd: string | null
}): CandidateProfile {
  return {
    lifeStageId: g.lifeStageId,
    gender: g.gender,
    language: g.language,
    birthDate: g.birthDate,
    workCity: g.workCity,
    workIndustry: g.workIndustry,
    meetingPreference: g.meetingPreference,
    scheduleSlots:
      g.scheduleDayOfWeek !== null && g.scheduleTimeStart !== null && g.scheduleTimeEnd !== null
        ? [{ dayOfWeek: g.scheduleDayOfWeek, timeStart: g.scheduleTimeStart, timeEnd: g.scheduleTimeEnd }]
        : [],
  }
}

function buildSmallGroupProfile(
  g: {
    id: string
    name: string
    lifeStageId: string | null
    genderFocus: "Male" | "Female" | "Mixed" | null
    language: string[]
    ageRangeMin: number | null
    ageRangeMax: number | null
    meetingFormat: "Online" | "Hybrid" | "InPerson" | null
    locationCity: string | null
    memberLimit: number | null
    scheduleDayOfWeek: number | null
    scheduleTimeStart: string | null
    scheduleTimeEnd: string | null
    _count: { members: number }
    members: { workIndustry: string | null }[]
  },
  overrideCount?: number,
  overrideIndustries?: string[]
): GroupProfile {
  return {
    id: g.id,
    name: g.name,
    lifeStageId: g.lifeStageId,
    genderFocus: g.genderFocus,
    language: g.language,
    ageRangeMin: g.ageRangeMin,
    ageRangeMax: g.ageRangeMax,
    meetingFormat: g.meetingFormat,
    locationCity: g.locationCity,
    memberLimit: g.memberLimit,
    currentCount: overrideCount ?? g._count.members,
    memberIndustries:
      overrideIndustries ??
      (g.members.map((m) => m.workIndustry).filter(Boolean) as string[]),
    scheduleSlots:
      g.scheduleDayOfWeek !== null && g.scheduleTimeStart !== null && g.scheduleTimeEnd !== null
        ? [{ dayOfWeek: g.scheduleDayOfWeek, timeStart: g.scheduleTimeStart, timeEnd: g.scheduleTimeEnd }]
        : [],
  }
}

// Prisma select object for a fully-scorable SmallGroup
const SMALL_GROUP_SCORE_SELECT = {
  id: true,
  name: true,
  lifeStageId: true,
  genderFocus: true,
  language: true,
  ageRangeMin: true,
  ageRangeMax: true,
  meetingFormat: true,
  locationCity: true,
  memberLimit: true,
  scheduleDayOfWeek: true,
  scheduleTimeStart: true,
  scheduleTimeEnd: true,
  _count: { select: { members: true } },
  members: { select: { workIndustry: true } },
} as const

async function loadSmallGroupWeights(): Promise<WeightConfig> {
  const config = await db.matchingWeightConfig.findUnique({
    where: { context: MatchingContext.SmallGroup },
  })
  return config ?? DEFAULT_WEIGHTS
}

async function loadBreakoutWeights(): Promise<WeightConfig> {
  const config = await db.matchingWeightConfig.findUnique({
    where: { context: MatchingContext.Breakout },
  })
  return config ?? DEFAULT_WEIGHTS
}

// ─── Small Group Matching ─────────────────────────────────────────────────────

export async function matchSmallGroups(
  params: { guestId: string } | { memberId: string },
  options?: { excludeCurrentGroup?: boolean; limit?: number }
): Promise<MatchResult[]> {
  let candidate: CandidateProfile
  let currentGroupId: string | null | undefined

  if ("guestId" in params) {
    const guest = await db.guest.findUnique({
      where: { id: params.guestId },
      select: {
        lifeStageId: true,
        gender: true,
        language: true,
        birthDate: true,
        workCity: true,
        workIndustry: true,
        meetingPreference: true,
        scheduleDayOfWeek: true,
        scheduleTimeStart: true,
        scheduleTimeEnd: true,
      },
    })
    if (!guest) return []
    candidate = buildCandidateFromGuest(guest)
    currentGroupId = null
  } else {
    const member = await db.member.findUnique({
      where: { id: params.memberId },
      select: {
        lifeStageId: true,
        gender: true,
        language: true,
        birthDate: true,
        workCity: true,
        workIndustry: true,
        meetingPreference: true,
        smallGroupId: true,
        schedulePreferences: {
          select: { dayOfWeek: true, timeStart: true, timeEnd: true },
        },
      },
    })
    if (!member) return []
    candidate = buildCandidateFromMember(member)
    currentGroupId = member.smallGroupId
  }

  const groups = await db.smallGroup.findMany({
    select: SMALL_GROUP_SCORE_SELECT,
  })

  const weights = await loadSmallGroupWeights()

  const eligible = groups.filter((g) => {
    if (options?.excludeCurrentGroup && currentGroupId && g.id === currentGroupId) {
      return false
    }
    if (g.memberLimit !== null && g._count.members >= g.memberLimit) return false
    return true
  })

  return eligible
    .map((g) => scoreGroup(candidate, buildSmallGroupProfile(g), weights))
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, options?.limit ?? 10)
}

// ─── Small Group Escalation Matching ─────────────────────────────────────────

/**
 * Matches a guest to small groups in three escalating levels:
 *   1. Small groups led by this guest's breakout group facilitator(s) in the given event
 *   2. Small groups led by any other volunteer at the same event
 *   3. All remaining small groups
 *
 * Each level only includes groups not already covered by a higher level.
 */
export async function matchSmallGroupsWithEscalation(
  guestId: string,
  eventId: string
): Promise<EscalationLevel[]> {
  const guest = await db.guest.findUnique({
    where: { id: guestId },
    select: {
      lifeStageId: true,
      gender: true,
      language: true,
      birthDate: true,
      workCity: true,
      workIndustry: true,
      meetingPreference: true,
      scheduleDayOfWeek: true,
      scheduleTimeStart: true,
      scheduleTimeEnd: true,
    },
  })
  if (!guest) return []

  const candidate = buildCandidateFromGuest(guest)
  const weights = await loadSmallGroupWeights()

  // ── Collect Level 1 group IDs (breakout facilitators' small groups) ───────
  const breakoutMemberships = await db.breakoutGroupMember.findMany({
    where: { registrant: { guestId, eventId } },
    select: {
      breakoutGroup: {
        select: {
          facilitator: {
            select: { member: { select: { ledGroups: { select: { id: true } } } } },
          },
          coFacilitator: {
            select: { member: { select: { ledGroups: { select: { id: true } } } } },
          },
        },
      },
    },
  })

  const level1Ids = new Set<string>()
  for (const bm of breakoutMemberships) {
    bm.breakoutGroup.facilitator?.member.ledGroups.forEach((g) => level1Ids.add(g.id))
    bm.breakoutGroup.coFacilitator?.member.ledGroups.forEach((g) => level1Ids.add(g.id))
  }

  // ── Collect Level 2 group IDs (other event volunteer leaders) ─────────────
  const eventVolunteers = await db.volunteer.findMany({
    where: { eventId },
    select: { member: { select: { ledGroups: { select: { id: true } } } } },
  })

  const level2Ids = new Set<string>()
  for (const v of eventVolunteers) {
    v.member.ledGroups.forEach((g) => {
      if (!level1Ids.has(g.id)) level2Ids.add(g.id)
    })
  }

  // ── Fetch and score all small groups in one query ─────────────────────────
  const allGroups = await db.smallGroup.findMany({
    select: SMALL_GROUP_SCORE_SELECT,
  })

  const eligible = allGroups.filter(
    (g) => g.memberLimit === null || g._count.members < g.memberLimit
  )

  const scored = eligible.map((g) => ({
    result: scoreGroup(candidate, buildSmallGroupProfile(g), weights),
    id: g.id,
  }))

  const sortByScore = (arr: typeof scored) =>
    arr.map((s) => s.result).sort((a, b) => b.totalScore - a.totalScore)

  const l1Scored = scored.filter((s) => level1Ids.has(s.id))
  const l2Scored = scored.filter((s) => level2Ids.has(s.id))
  const l3Scored = scored.filter((s) => !level1Ids.has(s.id) && !level2Ids.has(s.id))

  const levels: EscalationLevel[] = []

  if (l1Scored.length > 0) {
    levels.push({ level: 1, source: "breakout-facilitator", matches: sortByScore(l1Scored) })
  }
  if (l2Scored.length > 0) {
    levels.push({ level: 2, source: "event-volunteer", matches: sortByScore(l2Scored) })
  }
  if (l3Scored.length > 0) {
    levels.push({ level: 3, source: "all-small-groups", matches: sortByScore(l3Scored).slice(0, 10) })
  }

  return levels
}

// ─── Breakout Group Matching ──────────────────────────────────────────────────

export async function matchBreakoutGroups(
  registrantId: string,
  eventId: string,
  options?: { excludeAssigned?: boolean; limit?: number }
): Promise<MatchResult[]> {
  const registrant = await db.eventRegistrant.findUnique({
    where: { id: registrantId },
    select: {
      memberId: true,
      guestId: true,
      breakoutGroupMemberships: { select: { breakoutGroupId: true } },
      member: {
        select: {
          lifeStageId: true,
          gender: true,
          language: true,
          birthDate: true,
          workCity: true,
          workIndustry: true,
          meetingPreference: true,
          schedulePreferences: {
            select: { dayOfWeek: true, timeStart: true, timeEnd: true },
          },
        },
      },
      guest: {
        select: {
          lifeStageId: true,
          gender: true,
          language: true,
          birthDate: true,
          workCity: true,
          workIndustry: true,
          meetingPreference: true,
          scheduleDayOfWeek: true,
          scheduleTimeStart: true,
          scheduleTimeEnd: true,
        },
      },
    },
  })

  if (!registrant) return []

  const candidate: CandidateProfile = registrant.member
    ? buildCandidateFromMember(registrant.member)
    : registrant.guest
    ? buildCandidateFromGuest(registrant.guest)
    : EMPTY_CANDIDATE

  const assignedGroupIds = new Set(
    registrant.breakoutGroupMemberships.map((m) => m.breakoutGroupId)
  )

  const groups = await db.breakoutGroup.findMany({
    where: { eventId },
    select: {
      id: true,
      name: true,
      lifeStageId: true,
      genderFocus: true,
      language: true,
      ageRangeMin: true,
      ageRangeMax: true,
      meetingFormat: true,
      locationCity: true,
      memberLimit: true,
      _count: { select: { members: true } },
      members: {
        select: {
          registrant: {
            select: {
              member: { select: { workIndustry: true } },
              guest: { select: { workIndustry: true } },
            },
          },
        },
      },
      schedules: {
        select: { dayOfWeek: true, timeStart: true, timeEnd: true },
      },
    },
  })

  const weights = await loadBreakoutWeights()

  const eligible = groups.filter((g) => {
    if (options?.excludeAssigned && assignedGroupIds.has(g.id)) return false
    if (g.memberLimit !== null && g._count.members >= g.memberLimit) return false
    return true
  })

  return eligible
    .map((g) => {
      const memberIndustries = g.members
        .map(
          (m) =>
            m.registrant.member?.workIndustry ?? m.registrant.guest?.workIndustry
        )
        .filter((i): i is string => i != null)

      const profile: GroupProfile = {
        id: g.id,
        name: g.name,
        lifeStageId: g.lifeStageId,
        genderFocus: g.genderFocus,
        language: g.language,
        ageRangeMin: g.ageRangeMin,
        ageRangeMax: g.ageRangeMax,
        meetingFormat: g.meetingFormat,
        locationCity: g.locationCity,
        memberLimit: g.memberLimit,
        currentCount: g._count.members,
        memberIndustries,
        scheduleSlots: g.schedules,
      }

      return scoreGroup(candidate, profile, weights)
    })
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, options?.limit ?? 5)
}
