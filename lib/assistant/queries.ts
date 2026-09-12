// Read-only Prisma query helpers for assistant tools.
// Every list helper selects only the fields its serializer needs and caps rows.

import { db } from "@/lib/db"
import { formatPhilippinePhone } from "@/lib/utils"
import { allTokensMatch } from "@/lib/search/name-search"
import type { Prisma } from "@/app/generated/prisma/client"
import { clampRowLimit } from "./config"
import {
  toAssistantEventRow,
  toAssistantGroupRow,
  toAssistantGuestRow,
  toAssistantList,
  toAssistantMemberRow,
  toAssistantMinistryRow,
  toAssistantRegistrantRow,
  toAssistantVolunteerRow,
  fullName,
  isoDate,
  formatSchedule,
  type AssistantList,
  type AssistantEventRow,
  type AssistantGroupRow,
  type AssistantGuestRow,
  type AssistantMemberRow,
  type AssistantMinistryRow,
  type AssistantRegistrantRow,
  type AssistantVolunteerRow,
} from "./serializers"

const insensitive = "insensitive" as const

/**
 * Name/email/phone search filter shared by members and guests.
 *
 * The name half requires every token to match some name field (CCF-115), so
 * "Maria Santos" finds the person rather than nothing. The phone half stays a
 * whole-query exact match — a canonical number contains spaces, so tokenizing it
 * would compare fragments against a normalized string — and is OR'd alongside.
 */
function personSearchFilter(query: string): object {
  const nameMatch = allTokensMatch(query, (token) => [
    { firstName: { contains: token, mode: insensitive } },
    { lastName: { contains: token, mode: insensitive } },
    { nickname: { contains: token, mode: insensitive } },
    { email: { contains: token, mode: insensitive } },
  ])
  // A phone-looking query must be normalized to the canonical stored format
  // or the exact match silently fails.
  const phoneMatch = /\d{4,}/.test(query.replace(/[\s()+-]/g, ""))
    ? { phone: formatPhilippinePhone(query) }
    : null

  if (!nameMatch) return phoneMatch ?? {}
  if (!phoneMatch) return nameMatch
  return { OR: [nameMatch, phoneMatch] }
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function queryMembers(filters: {
  query?: string
  lifeStageId?: string
  gender?: "Male" | "Female"
  inSmallGroup?: boolean
  includeDGroups?: boolean
  limit?: number
}): Promise<AssistantList<AssistantMemberRow>> {
  const take = clampRowLimit(filters.limit)
  const where: Prisma.MemberWhereInput = {
    ...(filters.query ? personSearchFilter(filters.query) : {}),
    ...(filters.lifeStageId ? { lifeStageId: filters.lifeStageId } : {}),
    ...(filters.gender ? { gender: filters.gender } : {}),
    ...(filters.inSmallGroup === undefined
      ? {}
      : { smallGroupId: filters.inSmallGroup ? { not: null } : null }),
  }
  const [rows, totalCount] = await Promise.all([
    db.member.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        email: true,
        phone: true,
        gender: true,
        dateJoined: true,
        groupStatus: true,
        lifeStage: { select: { name: true } },
        smallGroup: { select: { name: true } },
        ageRangeBucket: { select: { label: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take,
    }),
    db.member.count({ where }),
  ])
  return toAssistantList(rows.map((row) => {
    const serialized = toAssistantMemberRow(row)
    return filters.includeDGroups === false
      ? { ...serialized, smallGroup: null, groupStatus: null }
      : serialized
  }), totalCount)
}

export async function getMemberDetail(memberId: string, allowedEventIds?: string[], includeDGroups = true) {
  const m = await db.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      email: true,
      phone: true,
      address: true,
      dateJoined: true,
      notes: true,
      gender: true,
      language: true,
      birthMonth: true,
      birthYear: true,
      workCity: true,
      workIndustry: true,
      meetingPreference: true,
      groupStatus: true,
      lifeStage: { select: { name: true } },
      ageRangeBucket: { select: { label: true } },
      smallGroup: { select: { id: true, name: true } },
      ledGroups: { select: { id: true, name: true } },
      schedulePreferences: {
        select: { dayOfWeek: true, timeStart: true, timeEnd: true },
        orderBy: [{ dayOfWeek: "asc" }, { timeStart: "asc" }],
      },
      eventRegistrations: {
        where: allowedEventIds ? { eventId: { in: allowedEventIds } } : {},
        select: {
          event: { select: { id: true, name: true, startDate: true } },
          attendedAt: true,
          isPaid: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  })
  if (!m) return null
  return {
    id: m.id,
    name: fullName(m),
    email: m.email,
    phone: m.phone,
    address: m.address,
    dateJoined: isoDate(m.dateJoined),
    notes: m.notes,
    gender: m.gender,
    language: m.language,
    birthMonth: m.birthMonth,
    birthYear: m.birthYear,
    ageRange: m.ageRangeBucket?.label ?? null,
    workCity: m.workCity,
    workIndustry: m.workIndustry,
    meetingPreference: m.meetingPreference,
    lifeStage: m.lifeStage?.name ?? null,
    smallGroup: includeDGroups ? m.smallGroup : null,
    groupStatus: includeDGroups ? m.groupStatus : null,
    leadsGroups: includeDGroups ? m.ledGroups : [],
    schedulePreferences: m.schedulePreferences.map((schedule) => ({
      dayOfWeek: schedule.dayOfWeek,
      day: formatSchedule(schedule.dayOfWeek, null),
      timeStart: schedule.timeStart,
      timeEnd: schedule.timeEnd,
    })),
    recentEventRegistrations: m.eventRegistrations.map((r) => ({
      eventId: r.event.id,
      eventName: r.event.name,
      eventDate: isoDate(r.event.startDate),
      attended: r.attendedAt !== null,
      isPaid: r.isPaid,
    })),
  }
}

// ─── Guests ───────────────────────────────────────────────────────────────────

export async function queryGuests(filters: {
  query?: string
  lifeStageId?: string
  status?: "active" | "promoted" | "all"
  includeDGroups?: boolean
  limit?: number
}): Promise<AssistantList<AssistantGuestRow>> {
  const take = clampRowLimit(filters.limit)
  const status = filters.status ?? "active"
  const where: Prisma.GuestWhereInput = {
    ...(filters.query ? personSearchFilter(filters.query) : {}),
    ...(filters.lifeStageId ? { lifeStageId: filters.lifeStageId } : {}),
    ...(status === "all" ? {} : { memberId: status === "promoted" ? { not: null } : null }),
  }
  const [rows, totalCount] = await Promise.all([
    db.guest.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        email: true,
        phone: true,
        gender: true,
        memberId: true,
        createdAt: true,
        lifeStage: { select: { name: true } },
        claimedSmallGroup: { select: { name: true } },
        claimedSatellite: true,
        ageRangeBucket: { select: { label: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    }),
    db.guest.count({ where }),
  ])
  return toAssistantList(rows.map((row) => {
    const serialized = toAssistantGuestRow(row)
    return filters.includeDGroups === false
      ? { ...serialized, claimedSmallGroup: null, claimedSatellite: null }
      : serialized
  }), totalCount)
}

export async function getGuestDetail(guestId: string, allowedEventIds?: string[], includeDGroups = true) {
  const g = await db.guest.findUnique({
    where: { id: guestId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      email: true,
      phone: true,
      notes: true,
      gender: true,
      language: true,
      birthMonth: true,
      birthYear: true,
      workCity: true,
      workIndustry: true,
      meetingPreference: true,
      scheduleDayOfWeek: true,
      scheduleTimeStart: true,
      scheduleTimeEnd: true,
      memberId: true,
      createdAt: true,
      lifeStage: { select: { name: true } },
      ageRangeBucket: { select: { label: true } },
      claimedSmallGroup: { select: { id: true, name: true } },
      claimedSatellite: true,
      groupRequests: {
        select: {
          id: true,
          status: true,
          smallGroup: { select: { id: true, name: true } },
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      eventRegistrations: {
        where: allowedEventIds ? { eventId: { in: allowedEventIds } } : {},
        select: {
          event: { select: { id: true, name: true, startDate: true } },
          attendedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  })
  if (!g) return null
  return {
    id: g.id,
    name: fullName(g),
    email: g.email,
    phone: g.phone,
    notes: g.notes,
    gender: g.gender,
    language: g.language,
    birthMonth: g.birthMonth,
    birthYear: g.birthYear,
    ageRange: g.ageRangeBucket?.label ?? null,
    workCity: g.workCity,
    workIndustry: g.workIndustry,
    meetingPreference: g.meetingPreference,
    schedule: formatSchedule(g.scheduleDayOfWeek, g.scheduleTimeStart),
    scheduleDetails: {
      dayOfWeek: g.scheduleDayOfWeek,
      day: g.scheduleDayOfWeek === null ? null : formatSchedule(g.scheduleDayOfWeek, null),
      timeStart: g.scheduleTimeStart,
      timeEnd: g.scheduleTimeEnd,
    },
    promoted: g.memberId !== null,
    promotedMemberId: g.memberId,
    createdAt: isoDate(g.createdAt),
    lifeStage: g.lifeStage?.name ?? null,
    claimedSmallGroup: includeDGroups ? g.claimedSmallGroup : null,
    claimedSatellite: includeDGroups ? g.claimedSatellite : null,
    groupRequests: includeDGroups ? g.groupRequests.map((r) => ({
      id: r.id,
      status: r.status,
      group: r.smallGroup,
      createdAt: isoDate(r.createdAt),
    })) : [],
    recentEventRegistrations: g.eventRegistrations.map((r) => ({
      eventId: r.event.id,
      eventName: r.event.name,
      eventDate: isoDate(r.event.startDate),
      attended: r.attendedAt !== null,
    })),
  }
}

// ─── Small groups ─────────────────────────────────────────────────────────────

export async function querySmallGroups(filters: {
  query?: string
  lifeStageId?: string
  dayOfWeek?: number
  groupType?: "Regular" | "Couples"
  status?: "Active" | "Pending" | "Inactive"
  genderFocus?: "Male" | "Female" | "Mixed"
  meetingFormat?: "Online" | "Hybrid" | "InPerson"
  locationCity?: string
  limit?: number
}): Promise<AssistantList<AssistantGroupRow>> {
  const take = clampRowLimit(filters.limit)
  const where: Prisma.SmallGroupWhereInput = {
    ...(allTokensMatch(filters.query ?? "", (token) => [
      { name: { contains: token, mode: insensitive } },
      { leader: { firstName: { contains: token, mode: insensitive } } },
      { leader: { lastName: { contains: token, mode: insensitive } } },
    ]) ?? {}),
    ...(filters.lifeStageId ? { lifeStages: { some: { id: filters.lifeStageId } } } : {}),
    ...(filters.dayOfWeek === undefined ? {} : { scheduleDayOfWeek: filters.dayOfWeek }),
    ...(filters.groupType ? { groupType: filters.groupType } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.genderFocus ? { genderFocus: filters.genderFocus } : {}),
    ...(filters.meetingFormat ? { meetingFormat: filters.meetingFormat } : {}),
    ...(filters.locationCity ? { locationCity: { contains: filters.locationCity, mode: insensitive } } : {}),
  }
  const [rows, totalCount] = await Promise.all([
    db.smallGroup.findMany({
      where,
      select: {
        id: true,
        name: true,
        genderFocus: true,
        groupType: true,
        status: true,
        memberLimit: true,
        scheduleDayOfWeek: true,
        scheduleTimeStart: true,
        scheduleTimeEnd: true,
        meetingFormat: true,
        locationCity: true,
        leader: { select: { firstName: true, lastName: true, nickname: true } },
        lifeStages: { select: { name: true } },
        _count: { select: { members: true } },
      },
      orderBy: { name: "asc" },
      take,
    }),
    db.smallGroup.count({ where }),
  ])
  return toAssistantList(rows.map(toAssistantGroupRow), totalCount)
}

export async function getSmallGroupDetail(groupId: string) {
  const g = await db.smallGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      genderFocus: true,
      groupType: true,
      status: true,
      language: true,
      ageRangeMin: true,
      ageRangeMax: true,
      meetingFormat: true,
      locationCity: true,
      memberLimit: true,
      scheduleDayOfWeek: true,
      scheduleTimeStart: true,
      scheduleTimeEnd: true,
      leader: { select: { id: true, firstName: true, lastName: true, nickname: true } },
      parentGroup: { select: { id: true, name: true } },
      parentSatellite: true,
      childGroups: {
        select: {
          id: true,
          name: true,
          leader: { select: { firstName: true, lastName: true, nickname: true } },
        },
        orderBy: { name: "asc" },
      },
      lifeStages: { select: { name: true } },
      members: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          nickname: true,
          groupStatus: true,
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      },
      memberRequests: {
        where: { status: "Pending" },
        select: {
          id: true,
          guest: { select: { firstName: true, lastName: true, nickname: true } },
          member: { select: { firstName: true, lastName: true, nickname: true } },
          createdAt: true,
        },
      },
      _count: { select: { childGroups: true } },
    },
  })
  if (!g) return null
  return {
    id: g.id,
    name: g.name,
    leader: g.leader ? { id: g.leader.id, name: fullName(g.leader) } : null,
    parentGroup: g.parentGroup,
    parentSatellite: g.parentSatellite,
    childGroupCount: g._count.childGroups,
    childGroups: g.childGroups.map((child) => ({
      id: child.id,
      name: child.name,
      leader: fullName(child.leader),
    })),
    lifeStages: g.lifeStages.map((ls) => ls.name),
    genderFocus: g.genderFocus,
    groupType: g.groupType,
    status: g.status,
    language: g.language,
    ageRange:
      g.ageRangeMin !== null || g.ageRangeMax !== null
        ? `${g.ageRangeMin ?? "?"}–${g.ageRangeMax ?? "?"}`
        : null,
    meetingFormat: g.meetingFormat,
    locationCity: g.locationCity,
    memberLimit: g.memberLimit,
    schedule: formatSchedule(g.scheduleDayOfWeek, g.scheduleTimeStart),
    scheduleDetails: {
      dayOfWeek: g.scheduleDayOfWeek,
      day: g.scheduleDayOfWeek === null ? null : formatSchedule(g.scheduleDayOfWeek, null),
      timeStart: g.scheduleTimeStart,
      timeEnd: g.scheduleTimeEnd,
    },
    members: g.members.map((m) => ({
      id: m.id,
      name: fullName(m),
      groupStatus: m.groupStatus,
    })),
    pendingRequests: g.memberRequests.map((r) => ({
      id: r.id,
      name: r.member ? fullName(r.member) : r.guest ? fullName(r.guest) : "Unknown",
      kind: r.member ? "member-transfer" : "guest",
      createdAt: isoDate(r.createdAt),
    })),
  }
}

export async function getSmallGroupStats() {
  const [groups, pendingRequests] = await Promise.all([
    db.smallGroup.findMany({
      select: {
        status: true,
        memberLimit: true,
        scheduleDayOfWeek: true,
        scheduleTimeStart: true,
        _count: { select: { members: true } },
      },
    }),
    db.smallGroupMemberRequest.count({ where: { status: "Pending" } }),
  ])
  const byStatus = { Active: 0, Pending: 0, Inactive: 0 }
  let totalRoster = 0
  let groupsAtCapacity = 0
  let groupsWithoutSchedule = 0
  for (const group of groups) {
    byStatus[group.status]++
    totalRoster += group._count.members
    if (group.memberLimit !== null && group._count.members >= group.memberLimit) groupsAtCapacity++
    if (group.scheduleDayOfWeek === null || group.scheduleTimeStart === null) groupsWithoutSchedule++
  }
  return {
    totalGroups: groups.length,
    byStatus,
    totalRoster,
    averageRosterSize: groups.length === 0 ? 0 : Math.round((totalRoster / groups.length) * 10) / 10,
    groupsAtCapacity,
    groupsWithoutCompleteSchedule: groupsWithoutSchedule,
    pendingRequests,
  }
}

export async function querySmallGroupRequests(filters: {
  status?: "Pending" | "Confirmed" | "Rejected"
  origin?: "Assignment" | "RegistrationIntent"
  groupId?: string
  sourceEventId?: string
  allowedSourceEventIds?: string[]
  limit?: number
}) {
  const take = clampRowLimit(filters.limit)
  const where: Prisma.SmallGroupMemberRequestWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.origin ? { origin: filters.origin } : {}),
    ...(filters.groupId ? { smallGroupId: filters.groupId } : {}),
    ...(filters.sourceEventId ? { sourceEventId: filters.sourceEventId } : {}),
    ...(filters.allowedSourceEventIds
      ? { OR: [{ sourceEventId: null }, { sourceEventId: { in: filters.allowedSourceEventIds } }] }
      : {}),
  }
  const [rows, totalCount] = await Promise.all([
    db.smallGroupMemberRequest.findMany({
      where,
      select: {
        id: true,
        status: true,
        origin: true,
        notes: true,
        declineReason: true,
        createdAt: true,
        resolvedAt: true,
        smallGroup: { select: { id: true, name: true } },
        fromGroup: { select: { id: true, name: true } },
        sourceEvent: { select: { id: true, name: true } },
        member: { select: { id: true, firstName: true, lastName: true, nickname: true } },
        guest: { select: { id: true, firstName: true, lastName: true, nickname: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    }),
    db.smallGroupMemberRequest.count({ where }),
  ])
  return toAssistantList(rows.map((request) => {
    const person = request.member ?? request.guest
    return {
      id: request.id,
      status: request.status,
      origin: request.origin,
      person: person ? { id: person.id, kind: request.member ? "member" : "guest", name: fullName(person) } : null,
      targetGroup: request.smallGroup,
      fromGroup: request.fromGroup,
      sourceEvent: request.sourceEvent,
      notes: request.notes,
      declineReason: request.declineReason,
      createdAt: request.createdAt.toISOString(),
      resolvedAt: request.resolvedAt?.toISOString() ?? null,
    }
  }), totalCount)
}

// ─── Ministries ───────────────────────────────────────────────────────────────

export async function queryMinistries(filters: {
  query?: string
  limit?: number
}): Promise<AssistantList<AssistantMinistryRow>> {
  const take = clampRowLimit(filters.limit)
  const where: Prisma.MinistryWhereInput = filters.query
    ? { name: { contains: filters.query, mode: insensitive } }
    : {}
  const [rows, totalCount] = await Promise.all([
    db.ministry.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        lifeStage: { select: { name: true } },
        _count: { select: { events: true } },
      },
      orderBy: { name: "asc" },
      take,
    }),
    db.ministry.count({ where }),
  ])
  return toAssistantList(rows.map(toAssistantMinistryRow), totalCount)
}

export async function getMinistryDetail(ministryId: string, allowedEventIds?: string[]) {
  const ministry = await db.ministry.findUnique({
    where: { id: ministryId },
    select: {
      id: true,
      name: true,
      description: true,
      logoUrl: true,
      themeColorPrimary: true,
      themeColorSecondary: true,
      themeColorAccent: true,
      lifeStage: { select: { id: true, name: true } },
      events: {
        where: allowedEventIds ? { eventId: { in: allowedEventIds } } : {},
        select: {
          event: {
            select: { id: true, name: true, type: true, startDate: true, endDate: true },
          },
        },
        orderBy: { event: { startDate: "desc" } },
        take: 20,
      },
    },
  })
  if (!ministry) return null
  return {
    id: ministry.id,
    name: ministry.name,
    description: ministry.description,
    lifeStage: ministry.lifeStage,
    branding: {
      logoUrl: ministry.logoUrl,
      primary: ministry.themeColorPrimary,
      secondary: ministry.themeColorSecondary,
      accent: ministry.themeColorAccent,
    },
    events: ministry.events.map(({ event }) => ({
      id: event.id,
      name: event.name,
      type: event.type,
      startDate: isoDate(event.startDate),
      endDate: isoDate(event.endDate),
    })),
  }
}

// ─── Events ───────────────────────────────────────────────────────────────────

export async function queryEvents(filters: {
  query?: string
  timeframe?: "upcoming" | "past" | "all"
  type?: "OneTime" | "MultiDay" | "Recurring"
  ministryId?: string
  startDateFrom?: Date
  startDateTo?: Date
  eventIds?: string[]
  limit?: number
}): Promise<AssistantList<AssistantEventRow>> {
  const take = clampRowLimit(filters.limit)
  const now = new Date()
  const timeframe = filters.timeframe ?? "all"
  const where: Prisma.EventWhereInput = {
    AND: [
      ...(filters.query ? [{ name: { contains: filters.query, mode: insensitive } }] : []),
      ...(filters.type ? [{ type: filters.type }] : []),
      ...(filters.ministryId ? [{ ministries: { some: { ministryId: filters.ministryId } } }] : []),
      ...(filters.startDateFrom ? [{ endDate: { gte: filters.startDateFrom } }] : []),
      ...(filters.startDateTo ? [{ startDate: { lte: filters.startDateTo } }] : []),
      ...(filters.eventIds ? [{ id: { in: filters.eventIds } }] : []),
      ...(timeframe === "upcoming"
        ? [{ endDate: { gte: now } }]
        : timeframe === "past"
          ? [{ endDate: { lt: now } }]
          : []),
    ],
  }
  const [rows, totalCount] = await Promise.all([
    db.event.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        startDate: true,
        endDate: true,
        price: true,
        _count: { select: { registrants: true } },
      },
      orderBy: { startDate: timeframe === "past" ? "desc" : "asc" },
      take,
    }),
    db.event.count({ where }),
  ])
  return toAssistantList(rows.map(toAssistantEventRow), totalCount)
}

export async function getEventDetail(eventId: string) {
  const e = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      name: true,
      description: true,
      type: true,
      startDate: true,
      endDate: true,
      price: true,
      registrationStart: true,
      registrationEnd: true,
      recurrenceDayOfWeek: true,
      recurrenceFrequency: true,
      recurrenceEndDate: true,
      allMinistries: true,
      formIncludeSmallGroup: true,
      formIncludeDietary: true,
      formIncludePayment: true,
      autoAssignBreakout: true,
      walkInSessionMode: true,
      walkInOccurrenceId: true,
      modules: { select: { type: true } },
      ministries: { select: { ministry: { select: { name: true } } } },
      _count: {
        select: {
          registrants: true,
          occurrences: true,
          breakoutGroups: true,
          volunteers: true,
        },
      },
    },
  })
  if (!e) return null
  const [paidCount, attendedCount] = await Promise.all([
    db.eventRegistrant.count({ where: { eventId, isPaid: true } }),
    db.eventRegistrant.count({ where: { eventId, attendedAt: { not: null } } }),
  ])
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    type: e.type,
    startDate: isoDate(e.startDate),
    endDate: isoDate(e.endDate),
    price: e.price === null ? null : e.price / 100,
    registrationStart: isoDate(e.registrationStart),
    registrationEnd: isoDate(e.registrationEnd),
    recurrence:
      e.type === "Recurring"
        ? {
            day: formatSchedule(e.recurrenceDayOfWeek, null),
            frequency: e.recurrenceFrequency,
            endDate: isoDate(e.recurrenceEndDate),
          }
        : null,
    modules: e.modules.map((m) => m.type),
    allMinistries: e.allMinistries,
    ministries: e.ministries.map((m) => m.ministry.name),
    forms: {
      collectsDGroupProfile: e.formIncludeSmallGroup,
      collectsDietaryNeeds: e.formIncludeDietary,
      collectsPayment: e.formIncludePayment,
      autoAssignsBreakouts: e.autoAssignBreakout,
      walkInSessionMode: e.walkInSessionMode,
      walkInOccurrenceId: e.walkInOccurrenceId,
    },
    registrantCount: e._count.registrants,
    paidCount,
    attendedCount,
    occurrenceCount: e._count.occurrences,
    breakoutGroupCount: e._count.breakoutGroups,
    volunteerCount: e._count.volunteers,
  }
}

export async function listEventOccurrences(eventId: string, limit?: number) {
  const take = clampRowLimit(limit)
  const [rows, totalCount] = await Promise.all([
    db.eventOccurrence.findMany({
      where: { eventId },
      select: {
        id: true,
        date: true,
        notes: true,
        isOpen: true,
        isStandalone: true,
        series: { select: { id: true, title: true } },
        _count: { select: { attendees: true } },
      },
      orderBy: { date: "desc" },
      take,
    }),
    db.eventOccurrence.count({ where: { eventId } }),
  ])
  return toAssistantList(rows.map((occurrence) => ({
    id: occurrence.id,
    date: occurrence.date.toISOString(),
    notes: occurrence.notes,
    isOpen: occurrence.isOpen,
    isStandalone: occurrence.isStandalone,
    series: occurrence.series,
    attendeeCount: occurrence._count.attendees,
  })), totalCount)
}

// ─── Attendance stats ─────────────────────────────────────────────────────────

export type EventAttendanceStats = {
  eventId: string
  eventName: string
  eventType: string
  totalRegistrants: number
  /** Per-occurrence attendance, chronological — chartable. Empty for OneTime. */
  sessions: {
    occurrenceId: string
    date: string | null
    attendeeCount: number
  }[]
  /** OneTime events only: attendance from registrant/volunteer attendedAt. */
  oneTime: { attendedCount: number; volunteersPresent: number } | null
}

export async function getEventAttendanceStats(
  eventId: string
): Promise<EventAttendanceStats | null> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, type: true },
  })
  if (!event) return null

  const totalRegistrants = await db.eventRegistrant.count({ where: { eventId } })

  if (event.type === "OneTime") {
    const [attendedCount, volunteersPresent] = await Promise.all([
      db.eventRegistrant.count({ where: { eventId, attendedAt: { not: null } } }),
      db.volunteer.count({ where: { eventId, attendedAt: { not: null } } }),
    ])
    return {
      eventId: event.id,
      eventName: event.name,
      eventType: event.type,
      totalRegistrants,
      sessions: [],
      oneTime: { attendedCount, volunteersPresent },
    }
  }

  const occurrences = await db.eventOccurrence.findMany({
    where: { eventId },
    select: {
      id: true,
      date: true,
      _count: { select: { attendees: true } },
    },
    orderBy: { date: "asc" },
  })
  return {
    eventId: event.id,
    eventName: event.name,
    eventType: event.type,
    totalRegistrants,
    sessions: occurrences.map((o) => ({
      occurrenceId: o.id,
      date: isoDate(o.date),
      attendeeCount: o._count.attendees,
    })),
    oneTime: null,
  }
}

// ─── Event registrants ────────────────────────────────────────────────────────

export async function queryEventRegistrants(filters: {
  eventId: string
  query?: string
  isPaid?: boolean
  attended?: boolean
  limit?: number
}): Promise<AssistantList<AssistantRegistrantRow>> {
  const take = clampRowLimit(filters.limit)
  const q = filters.query
  // A registrant's name lives either on the row itself (anonymous) or on the
  // linked member/guest, so every token has to match across all three.
  const nameFilter =
    allTokensMatch(q ?? "", (token) => [
      { firstName: { contains: token, mode: insensitive } },
      { lastName: { contains: token, mode: insensitive } },
      { member: { firstName: { contains: token, mode: insensitive } } },
      { member: { lastName: { contains: token, mode: insensitive } } },
      { guest: { firstName: { contains: token, mode: insensitive } } },
      { guest: { lastName: { contains: token, mode: insensitive } } },
    ]) ?? {}
  const where: Prisma.EventRegistrantWhereInput = {
    eventId: filters.eventId,
    ...nameFilter,
    ...(filters.isPaid === undefined ? {} : { isPaid: filters.isPaid }),
    ...(filters.attended === undefined
      ? {}
      : { attendedAt: filters.attended ? { not: null } : null }),
  }
  const personSelect = {
    select: { firstName: true, lastName: true, nickname: true, phone: true },
  }
  const [rows, totalCount] = await Promise.all([
    db.eventRegistrant.findMany({
      where,
      select: {
        id: true,
        memberId: true,
        guestId: true,
        firstName: true,
        lastName: true,
        nickname: true,
        mobileNumber: true,
        isPaid: true,
        paymentReference: true,
        attendedAt: true,
        member: personSelect,
        guest: personSelect,
      },
      orderBy: { createdAt: "asc" },
      take,
    }),
    db.eventRegistrant.count({ where }),
  ])
  return toAssistantList(rows.map(toAssistantRegistrantRow), totalCount)
}

// ─── Volunteers ───────────────────────────────────────────────────────────────

export async function queryVolunteers(filters: {
  eventId?: string
  query?: string
  status?: "Pending" | "Confirmed" | "Rejected"
  limit?: number
}): Promise<AssistantList<AssistantVolunteerRow>> {
  const take = clampRowLimit(filters.limit)
  const where: Prisma.VolunteerWhereInput = {
    ...(filters.eventId ? { eventId: filters.eventId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.query
      ? {
          member: allTokensMatch(filters.query, (token) => [
            { firstName: { contains: token, mode: insensitive } },
            { lastName: { contains: token, mode: insensitive } },
          ]) ?? {},
        }
      : {}),
  }
  const [rows, totalCount] = await Promise.all([
    db.volunteer.findMany({
      where,
      select: {
        id: true,
        memberId: true,
        status: true,
        member: { select: { firstName: true, lastName: true, nickname: true } },
        event: { select: { name: true } },
        committee: { select: { name: true } },
        preferredRole: { select: { name: true } },
        assignedRole: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    }),
    db.volunteer.count({ where }),
  ])
  return toAssistantList(rows.map(toAssistantVolunteerRow), totalCount)
}

export async function getVolunteerDetail(volunteerId: string) {
  const volunteer = await db.volunteer.findUnique({
    where: { id: volunteerId },
    select: {
      id: true,
      status: true,
      ageGroup: true,
      notes: true,
      leaderNotes: true,
      attendedAt: true,
      createdAt: true,
      member: { select: { id: true, firstName: true, lastName: true, nickname: true } },
      event: { select: { id: true, name: true, type: true } },
      committee: { select: { id: true, name: true } },
      preferredRole: { select: { id: true, name: true } },
      assignedRole: { select: { id: true, name: true } },
      lifeStage: { select: { id: true, name: true } },
      occurrenceAttendances: {
        select: { checkedInAt: true, occurrence: { select: { id: true, date: true } } },
        orderBy: { checkedInAt: "desc" },
        take: 10,
      },
    },
  })
  if (!volunteer) return null
  return {
    id: volunteer.id,
    status: volunteer.status,
    member: { id: volunteer.member.id, name: fullName(volunteer.member) },
    event: volunteer.event,
    committee: volunteer.committee,
    preferredRole: volunteer.preferredRole,
    assignedRole: volunteer.assignedRole,
    lifeStage: volunteer.lifeStage,
    ageGroup: volunteer.ageGroup,
    notes: volunteer.notes,
    leaderNotes: volunteer.leaderNotes,
    attendedAt: volunteer.attendedAt?.toISOString() ?? null,
    createdAt: volunteer.createdAt.toISOString(),
    recentSessionAttendance: volunteer.occurrenceAttendances.map((attendance) => ({
      occurrenceId: attendance.occurrence.id,
      date: attendance.occurrence.date.toISOString(),
      checkedInAt: attendance.checkedInAt.toISOString(),
    })),
  }
}

export async function getFamilyDetail(familyId: string) {
  const family = await db.family.findUnique({
    where: { id: familyId },
    select: {
      id: true,
      name: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      members: {
        select: {
          id: true,
          role: true,
          member: { select: { id: true, firstName: true, lastName: true, nickname: true, phone: true, email: true } },
          guest: { select: { id: true, firstName: true, lastName: true, nickname: true, phone: true, email: true, memberId: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  })
  if (!family) return null
  return {
    id: family.id,
    name: family.name,
    notes: family.notes,
    createdAt: family.createdAt.toISOString(),
    updatedAt: family.updatedAt.toISOString(),
    members: family.members.map((membership) => {
      const person = membership.member ?? membership.guest
      return {
        familyMemberId: membership.id,
        role: membership.role,
        person: person ? {
          id: person.id,
          kind: membership.member ? "member" : "guest",
          name: fullName(person),
          phone: person.phone,
          email: person.email,
          promotedMemberId: membership.guest?.memberId ?? null,
        } : null,
      }
    }),
  }
}

// ─── Counts ───────────────────────────────────────────────────────────────────

export async function getEntityCounts(features: {
  members: boolean
  guests: boolean
  smallGroups: boolean
  ministries: boolean
  events: boolean
  volunteers: boolean
  families?: boolean
  eventIds?: string[]
}) {
  const [members, activeGuests, smallGroups, ministries, upcomingEvents, volunteers, families] =
    await Promise.all([
      features.members ? db.member.count() : null,
      features.guests ? db.guest.count({ where: { memberId: null } }) : null,
      features.smallGroups ? db.smallGroup.count() : null,
      features.ministries ? db.ministry.count() : null,
      features.events ? db.event.count({ where: { endDate: { gte: new Date() }, ...(features.eventIds ? { id: { in: features.eventIds } } : {}) } }) : null,
      features.volunteers ? db.volunteer.count({ where: features.eventIds ? { eventId: { in: features.eventIds } } : {} }) : null,
      features.families ? db.family.count() : null,
    ])
  return { members, activeGuests, smallGroups, ministries, upcomingEvents, volunteers, families }
}

// ─── Life stages (shared lookup) ─────────────────────────────────────────────

export async function listLifeStages() {
  return db.lifeStage.findMany({
    select: { id: true, name: true },
    orderBy: { order: "asc" },
  })
}
