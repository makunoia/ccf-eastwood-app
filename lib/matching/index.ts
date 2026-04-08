import { db } from "@/lib/db"
import { MatchingContext } from "@/app/generated/prisma/client"
import { DEFAULT_WEIGHTS } from "@/lib/validations/matching-weights"
import { scoreGroup } from "./engine"
import { EMPTY_CANDIDATE } from "./types"
import type { CandidateProfile, GroupProfile, MatchResult, WeightConfig } from "./types"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildCandidateFromMember(m: {
  lifeStageId: string | null
  gender: "Male" | "Female" | null
  language: string | null
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
  language: string | null
  birthDate: Date | null
  workCity: string | null
  workIndustry: string | null
  meetingPreference: "Online" | "Hybrid" | "InPerson" | null
}): CandidateProfile {
  return {
    lifeStageId: g.lifeStageId,
    gender: g.gender,
    language: g.language,
    birthDate: g.birthDate,
    workCity: g.workCity,
    workIndustry: g.workIndustry,
    meetingPreference: g.meetingPreference,
    scheduleSlots: [], // Guest has no SchedulePreference relation
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
    _count: { members: number }
    members: { workIndustry: string | null }[]
    meetingSchedules: { dayOfWeek: number; timeStart: string; timeEnd: string }[]
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
    scheduleSlots: g.meetingSchedules,
  }
}

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
      members: { select: { workIndustry: true } },
      meetingSchedules: {
        select: { dayOfWeek: true, timeStart: true, timeEnd: true },
      },
    },
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
    .slice(0, options?.limit ?? 5)
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
