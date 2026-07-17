// Read-only Prisma query helpers for assistant tools.
// Every list helper selects only the fields its serializer needs and caps rows.

import { db } from "@/lib/db"
import { formatPhilippinePhone } from "@/lib/utils"
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

/** Name/email/phone search clauses shared by members and guests. */
function personSearchClauses(query: string) {
  const clauses: object[] = [
    { firstName: { contains: query, mode: insensitive } },
    { lastName: { contains: query, mode: insensitive } },
    { nickname: { contains: query, mode: insensitive } },
    { email: { contains: query, mode: insensitive } },
  ]
  // A phone-looking query must be normalized to the canonical stored format
  // or the exact match silently fails.
  if (/\d{4,}/.test(query.replace(/[\s()+-]/g, ""))) {
    clauses.push({ phone: formatPhilippinePhone(query) })
  }
  return clauses
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function queryMembers(filters: {
  query?: string
  lifeStageId?: string
  gender?: "Male" | "Female"
  inSmallGroup?: boolean
  limit?: number
}): Promise<AssistantList<AssistantMemberRow>> {
  const take = clampRowLimit(filters.limit)
  const where: Prisma.MemberWhereInput = {
    ...(filters.query ? { OR: personSearchClauses(filters.query) } : {}),
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
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take,
    }),
    db.member.count({ where }),
  ])
  return toAssistantList(rows.map(toAssistantMemberRow), totalCount)
}

export async function getMemberDetail(memberId: string) {
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
      smallGroup: { select: { id: true, name: true } },
      ledGroups: { select: { id: true, name: true } },
      eventRegistrations: {
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
    workCity: m.workCity,
    workIndustry: m.workIndustry,
    meetingPreference: m.meetingPreference,
    lifeStage: m.lifeStage?.name ?? null,
    smallGroup: m.smallGroup,
    groupStatus: m.groupStatus,
    leadsGroups: m.ledGroups,
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
  limit?: number
}): Promise<AssistantList<AssistantGuestRow>> {
  const take = clampRowLimit(filters.limit)
  const status = filters.status ?? "active"
  const where: Prisma.GuestWhereInput = {
    ...(filters.query ? { OR: personSearchClauses(filters.query) } : {}),
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
      },
      orderBy: { createdAt: "desc" },
      take,
    }),
    db.guest.count({ where }),
  ])
  return toAssistantList(rows.map(toAssistantGuestRow), totalCount)
}

export async function getGuestDetail(guestId: string) {
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
      memberId: true,
      createdAt: true,
      lifeStage: { select: { name: true } },
      claimedSmallGroup: { select: { id: true, name: true } },
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
    workCity: g.workCity,
    workIndustry: g.workIndustry,
    meetingPreference: g.meetingPreference,
    schedule: formatSchedule(g.scheduleDayOfWeek, g.scheduleTimeStart),
    promoted: g.memberId !== null,
    promotedMemberId: g.memberId,
    createdAt: isoDate(g.createdAt),
    lifeStage: g.lifeStage?.name ?? null,
    claimedSmallGroup: g.claimedSmallGroup,
    groupRequests: g.groupRequests.map((r) => ({
      id: r.id,
      status: r.status,
      group: r.smallGroup,
      createdAt: isoDate(r.createdAt),
    })),
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
  limit?: number
}): Promise<AssistantList<AssistantGroupRow>> {
  const take = clampRowLimit(filters.limit)
  const where: Prisma.SmallGroupWhereInput = {
    ...(filters.query
      ? {
          OR: [
            { name: { contains: filters.query, mode: insensitive } },
            { leader: { firstName: { contains: filters.query, mode: insensitive } } },
            { leader: { lastName: { contains: filters.query, mode: insensitive } } },
          ],
        }
      : {}),
    ...(filters.lifeStageId ? { lifeStages: { some: { id: filters.lifeStageId } } } : {}),
    ...(filters.dayOfWeek === undefined ? {} : { scheduleDayOfWeek: filters.dayOfWeek }),
    ...(filters.groupType ? { groupType: filters.groupType } : {}),
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
      leader: { select: { id: true, firstName: true, lastName: true, nickname: true } },
      parentGroup: { select: { id: true, name: true } },
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
    childGroupCount: g._count.childGroups,
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

// ─── Events ───────────────────────────────────────────────────────────────────

export async function queryEvents(filters: {
  query?: string
  timeframe?: "upcoming" | "past" | "all"
  limit?: number
}): Promise<AssistantList<AssistantEventRow>> {
  const take = clampRowLimit(filters.limit)
  const now = new Date()
  const timeframe = filters.timeframe ?? "all"
  const where: Prisma.EventWhereInput = {
    ...(filters.query ? { name: { contains: filters.query, mode: insensitive } } : {}),
    ...(timeframe === "upcoming"
      ? { endDate: { gte: now } }
      : timeframe === "past"
        ? { endDate: { lt: now } }
        : {}),
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
          }
        : null,
    modules: e.modules.map((m) => m.type),
    ministries: e.ministries.map((m) => m.ministry.name),
    registrantCount: e._count.registrants,
    paidCount,
    attendedCount,
    occurrenceCount: e._count.occurrences,
    breakoutGroupCount: e._count.breakoutGroups,
    volunteerCount: e._count.volunteers,
  }
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
  const nameFilter = q
    ? {
        OR: [
          { firstName: { contains: q, mode: insensitive } },
          { lastName: { contains: q, mode: insensitive } },
          { member: { firstName: { contains: q, mode: insensitive } } },
          { member: { lastName: { contains: q, mode: insensitive } } },
          { guest: { firstName: { contains: q, mode: insensitive } } },
          { guest: { lastName: { contains: q, mode: insensitive } } },
        ],
      }
    : {}
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
          member: {
            OR: [
              { firstName: { contains: filters.query, mode: insensitive } },
              { lastName: { contains: filters.query, mode: insensitive } },
            ],
          },
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

// ─── Counts ───────────────────────────────────────────────────────────────────

export async function getEntityCounts(features: {
  members: boolean
  guests: boolean
  smallGroups: boolean
  ministries: boolean
  events: boolean
  volunteers: boolean
}) {
  const [members, activeGuests, smallGroups, ministries, upcomingEvents, volunteers] =
    await Promise.all([
      features.members ? db.member.count() : null,
      features.guests ? db.guest.count({ where: { memberId: null } }) : null,
      features.smallGroups ? db.smallGroup.count() : null,
      features.ministries ? db.ministry.count() : null,
      features.events ? db.event.count({ where: { endDate: { gte: new Date() } } }) : null,
      features.volunteers ? db.volunteer.count() : null,
    ])
  return { members, activeGuests, smallGroups, ministries, upcomingEvents, volunteers }
}

// ─── Life stages (shared lookup) ─────────────────────────────────────────────

export async function listLifeStages() {
  return db.lifeStage.findMany({
    select: { id: true, name: true },
    orderBy: { order: "asc" },
  })
}
