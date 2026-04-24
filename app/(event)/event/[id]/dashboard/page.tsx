import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { EventDashboardClient } from "./dashboard-client"
import { ensureMultiDayOccurrences } from "@/app/(dashboard)/events/actions"

type PeriodFilter = "7d" | "30d" | "90d" | "all"
type LeaderRoleFilter = "all" | "Timothy" | "Leader"
type UngroupedParticipant = {
  id: string
  name: string
  type: "Member" | "Guest"
}

function getPeriodStart(period: PeriodFilter, eventStart: Date) {
  const now = new Date()
  if (period === "all") return eventStart

  const daysBack = period === "7d" ? 7 : period === "30d" ? 30 : 90
  const start = new Date(now)
  start.setUTCDate(start.getUTCDate() - daysBack)
  return start
}

async function getEventDashboard(id: string, period: PeriodFilter, roleFilter: LeaderRoleFilter) {
  const event = await db.event.findUnique({
    where: { id },
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
      ministries: {
        include: { ministry: { select: { name: true } } },
      },
      breakoutGroups: {
        select: { id: true },
      },
      _count: {
        select: { registrants: true, occurrences: true },
      },
      registrants: {
        select: {
          id: true,
          isPaid: true,
          attendedAt: true,
          memberId: true,
          guestId: true,
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              groupStatus: true,
              smallGroupId: true,
              updatedAt: true,
            },
          },
          guest: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              memberId: true,
              member: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  groupStatus: true,
                  smallGroupId: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
      },
      volunteers: {
        select: {
          status: true,
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              groupStatus: true,
              smallGroupId: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  })

  if (!event) return null

  const periodStart = getPeriodStart(period, event.startDate)
  const periodEnd = new Date()

  const occurrenceSeries =
    event.type === "OneTime"
      ? []
      : await db.eventOccurrence.findMany({
          where: {
            eventId: event.id,
            date: {
              gte: periodStart,
              lte: periodEnd,
            },
          },
          orderBy: { date: "asc" },
          select: {
            date: true,
            _count: { select: { attendees: true } },
          },
        })

  const uniqueAttendees =
    event.type === "OneTime"
      ? new Set(
          event.registrants
            .filter((r) => r.attendedAt && r.attendedAt >= periodStart && r.attendedAt <= periodEnd)
            .map((r) => r.id)
        ).size
      : (
          await db.occurrenceAttendee.findMany({
            where: {
              occurrence: {
                eventId: event.id,
                date: {
                  gte: periodStart,
                  lte: periodEnd,
                },
              },
            },
            distinct: ["registrantId"],
            select: { registrantId: true },
          })
        ).length

  const breakoutGroupIds = event.breakoutGroups.map((bg) => bg.id)
  const confirmedGuestRequests =
    breakoutGroupIds.length === 0
      ? []
      : await db.smallGroupMemberRequest.findMany({
          where: {
            status: "Confirmed",
            guestId: { not: null },
            breakoutGroupId: { in: breakoutGroupIds },
            resolvedAt: {
              not: null,
              gte: periodStart,
              lte: periodEnd,
            },
          },
          orderBy: { resolvedAt: "desc" },
          select: {
            id: true,
            resolvedAt: true,
            smallGroup: { select: { name: true } },
            guest: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                member: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    groupStatus: true,
                    smallGroupId: true,
                  },
                },
              },
            },
          },
        })

  const paidCount = event.registrants.filter((r) => r.isPaid).length
  const attendedCount = event.registrants.filter((r) => r.attendedAt).length
  const totalCheckIns = occurrenceSeries.reduce((sum, o) => sum + o._count.attendees, 0)
  const averageAttendance =
    event.type === "OneTime"
      ? attendedCount
      : occurrenceSeries.length > 0
        ? totalCheckIns / occurrenceSeries.length
        : 0

  const participantMembers = new Map<
    string,
    {
      id: string
      fullName: string
      groupStatus: "Member" | "Timothy" | "Leader" | null
      smallGroupId: string | null
      updatedAt: Date
    }
  >()

  for (const registrant of event.registrants) {
    if (registrant.member) {
      participantMembers.set(registrant.member.id, {
        id: registrant.member.id,
        fullName: `${registrant.member.firstName} ${registrant.member.lastName}`,
        groupStatus: registrant.member.groupStatus,
        smallGroupId: registrant.member.smallGroupId,
        updatedAt: registrant.member.updatedAt,
      })
    }

    if (registrant.guest?.member) {
      const promoted = registrant.guest.member
      participantMembers.set(promoted.id, {
        id: promoted.id,
        fullName: `${promoted.firstName} ${promoted.lastName}`,
        groupStatus: promoted.groupStatus,
        smallGroupId: promoted.smallGroupId,
        updatedAt: promoted.updatedAt,
      })
    }
  }

  // Also include confirmed volunteers — a Timothy facilitator who becomes a
  // Leader via Catch Mech may not have an EventRegistrant record.
  for (const volunteer of event.volunteers) {
    if (volunteer.status === "Confirmed" && volunteer.member) {
      const m = volunteer.member
      // Only add if not already tracked via a registrant record
      if (!participantMembers.has(m.id)) {
        participantMembers.set(m.id, {
          id: m.id,
          fullName: `${m.firstName} ${m.lastName}`,
          groupStatus: m.groupStatus,
          smallGroupId: m.smallGroupId,
          updatedAt: m.updatedAt,
        })
      }
    }
  }

  const newLeaders = Array.from(participantMembers.values())
    .filter((member) => member.groupStatus === "Leader" && member.updatedAt >= periodStart)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

  const confirmedGuestsNowMembers = confirmedGuestRequests
    .filter((req) => req.guest?.member && req.guest.member.smallGroupId)
    .map((req) => ({
      id: req.id,
      name: `${req.guest!.firstName} ${req.guest!.lastName}`,
      memberStatus: req.guest!.member!.groupStatus,
      smallGroupName: req.smallGroup.name,
      resolvedAt: req.resolvedAt!.toISOString(),
    }))
    .filter((row) => {
      if (roleFilter === "all") return true
      return row.memberStatus === roleFilter
    })

  const participantsWithoutSmallGroup = event.registrants
    .flatMap<UngroupedParticipant>((registrant) => {
      if (registrant.member && !registrant.member.smallGroupId) {
        return [
          {
            id: `member-${registrant.member.id}`,
            name: `${registrant.member.firstName} ${registrant.member.lastName}`,
            type: "Member",
          },
        ]
      }

      if (registrant.guest) {
        if (!registrant.guest.memberId) {
          return [
            {
              id: `guest-${registrant.guest.id}`,
              name: `${registrant.guest.firstName} ${registrant.guest.lastName}`,
              type: "Guest",
            },
          ]
        }

        if (registrant.guest.member && !registrant.guest.member.smallGroupId) {
          return [
            {
              id: `member-${registrant.guest.member.id}`,
              name: `${registrant.guest.member.firstName} ${registrant.guest.member.lastName}`,
              type: "Member",
            },
          ]
        }
      }

      return []
    })
    .filter((person, index, list) => list.findIndex((p) => p.id === person.id) === index)

  const confirmedVolunteers = event.volunteers
    .filter((volunteer) => volunteer.status === "Confirmed")
    .map((volunteer) => ({
      id: volunteer.member.id,
      name: `${volunteer.member.firstName} ${volunteer.member.lastName}`,
    }))

  const unconfirmedVolunteers = event.volunteers
    .filter((volunteer) => volunteer.status !== "Confirmed")
    .map((volunteer) => ({
      id: volunteer.member.id,
      name: `${volunteer.member.firstName} ${volunteer.member.lastName}`,
      status: volunteer.status,
    }))

  const pendingVolunteerCount = event.volunteers.filter((v) => v.status === "Pending").length
  const rejectedVolunteerCount = event.volunteers.filter((v) => v.status === "Rejected").length

  return {
    id: event.id,
    name: event.name,
    description: event.description,
    type: event.type,
    startDate: event.startDate.toISOString(),
    endDate: event.endDate.toISOString(),
    price: event.price,
    registrationStart: event.registrationStart?.toISOString() ?? null,
    registrationEnd: event.registrationEnd?.toISOString() ?? null,
    recurrenceDayOfWeek: event.recurrenceDayOfWeek,
    recurrenceFrequency: event.recurrenceFrequency,
    recurrenceEndDate: event.recurrenceEndDate?.toISOString() ?? null,
    ministries: event.ministries.map((em) => em.ministry.name),
    registrantCount: event._count.registrants,
    paidCount,
    attendedCount,
    occurrenceCount: event._count.occurrences,
    totalCheckIns,
    period,
    roleFilter,
    averageAttendance,
    uniqueAttendees,
    newLeaders: newLeaders.map((leader) => ({
      id: leader.id,
      name: leader.fullName,
      updatedAt: leader.updatedAt.toISOString(),
    })),
    confirmedGuestsNowMembers,
    participantsWithoutSmallGroup,
    attendanceSeries: occurrenceSeries.map((occurrence) => ({
      date: occurrence.date.toISOString(),
      attendees: occurrence._count.attendees,
    })),
    confirmedVolunteers,
    unconfirmedVolunteers,
    pendingVolunteerCount,
    rejectedVolunteerCount,
  }
}

export default async function EventDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  const sp = await searchParams
  const period = ((sp.period as string) || "30d") as PeriodFilter
  const roleFilter = ((sp.roleFilter as string) || "all") as LeaderRoleFilter

  const normalizedPeriod: PeriodFilter = ["7d", "30d", "90d", "all"].includes(period)
    ? period
    : "30d"
  const normalizedRoleFilter: LeaderRoleFilter = ["all", "Timothy", "Leader"].includes(roleFilter)
    ? roleFilter
    : "all"

  let event = await getEventDashboard(id, normalizedPeriod, normalizedRoleFilter)
  if (!event) notFound()

  // Ensure MultiDay occurrences are up to date
  if (event.type === "MultiDay") {
    await ensureMultiDayOccurrences(
      event.id,
      new Date(event.startDate),
      new Date(event.endDate)
    )
    event = await getEventDashboard(id, normalizedPeriod, normalizedRoleFilter)
    if (!event) notFound()
  }

  return (
    <EventDashboardClient event={event} />
  )
}
