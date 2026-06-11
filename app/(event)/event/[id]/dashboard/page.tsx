import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { EventDashboardClient } from "./dashboard-client"
import { ensureMultiDayOccurrences } from "@/app/(dashboard)/events/actions"
import { loadRecurringSeriesSummaries } from "@/lib/events/series-summary"

type PeriodFilter = "7d" | "30d" | "90d" | "all"
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

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

async function getEventDashboard(id: string, period: PeriodFilter) {
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
      useMinistryBrand: true,
      brandMinistryId: true,
      themeColorSecondary: true,
      ministries: {
        include: { ministry: { select: { id: true, name: true, themeColorSecondary: true } } },
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
          createdAt: true,
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
            id: true,
            isOpen: true,
            isStandalone: true,
            seriesId: true,
            _count: { select: { attendees: true } },
          },
        })

  // Series summaries are whole-series rollups — they must reflect the entire
  // series, not the dashboard's rolling period window. Loaded via a dedicated
  // unfiltered query. See loadRecurringSeriesSummaries.
  const recurringSeriesSummaries =
    event.type === "Recurring" ? await loadRecurringSeriesSummaries(db, event.id) : []

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
            memberId: { not: null },
            member: { guest: { isNot: null } },
            breakoutGroupId: { in: breakoutGroupIds },
            resolvedAt: {
              not: null,
              gte: periodStart,
              lte: periodEnd,
            },
          },
          select: {
            id: true,
            member: { select: { smallGroupId: true } },
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
      groupStatus: "Member" | "Timothy" | "Leader" | null
      updatedAt: Date
    }
  >()

  for (const registrant of event.registrants) {
    if (registrant.member) {
      participantMembers.set(registrant.member.id, {
        groupStatus: registrant.member.groupStatus,
        updatedAt: registrant.member.updatedAt,
      })
    }

    if (registrant.guest?.member) {
      const promoted = registrant.guest.member
      participantMembers.set(promoted.id, {
        groupStatus: promoted.groupStatus,
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
          groupStatus: m.groupStatus,
          updatedAt: m.updatedAt,
        })
      }
    }
  }

  let newTimothys = 0
  let newLeaders = 0
  for (const member of participantMembers.values()) {
    if (member.updatedAt < periodStart) continue
    if (member.groupStatus === "Timothy") newTimothys++
    else if (member.groupStatus === "Leader") newLeaders++
  }

  const confirmedGuestsCount = confirmedGuestRequests.filter(
    (req) => req.member?.smallGroupId
  ).length

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

  const membersUnassigned = participantsWithoutSmallGroup.filter((p) => p.type === "Member").length
  const guestsUnassigned = participantsWithoutSmallGroup.filter((p) => p.type === "Guest").length

  const groupedMemberIds = new Set<string>()
  for (const registrant of event.registrants) {
    const member = registrant.member ?? registrant.guest?.member
    if (member?.smallGroupId) groupedMemberIds.add(member.id)
  }
  const inGroup = groupedMemberIds.size

  // Cumulative registration growth, bucketed by UTC day. Registrants created
  // before the window still count toward the baseline so the line starts at
  // the right height.
  const sortedRegistrationDates = event.registrants
    .map((r) => r.createdAt)
    .sort((a, b) => a.getTime() - b.getTime())
  const registrationWindowStart =
    period === "all" && sortedRegistrationDates.length > 0
      ? sortedRegistrationDates[0]
      : periodStart

  let registrationBaseline = 0
  const dailyRegistrations = new Map<string, number>()
  for (const created of sortedRegistrationDates) {
    if (created < registrationWindowStart) {
      registrationBaseline++
      continue
    }
    if (created > periodEnd) continue
    const key = dayKey(created)
    dailyRegistrations.set(key, (dailyRegistrations.get(key) ?? 0) + 1)
  }

  let runningTotal = registrationBaseline
  const registrationSeries = Array.from(dailyRegistrations.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => {
      runningTotal += count
      return { date, total: runningTotal }
    })
  if (registrationBaseline > 0 && registrationSeries[0]?.date !== dayKey(registrationWindowStart)) {
    registrationSeries.unshift({
      date: dayKey(registrationWindowStart),
      total: registrationBaseline,
    })
  }

  const confirmedVolunteerCount = event.volunteers.filter((v) => v.status === "Confirmed").length
  const pendingVolunteerCount = event.volunteers.filter((v) => v.status === "Pending").length
  const rejectedVolunteerCount = event.volunteers.filter((v) => v.status === "Rejected").length

  let brandBackground: string | null = null
  if (event.useMinistryBrand && event.brandMinistryId) {
    const brandMinistry = event.ministries.find((em) => em.ministry.id === event.brandMinistryId)
    brandBackground = brandMinistry?.ministry.themeColorSecondary ?? null
  } else {
    brandBackground = event.themeColorSecondary ?? null
  }

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
    averageAttendance,
    uniqueAttendees,
    attendanceSeries: occurrenceSeries.map((occurrence) => ({
      date: occurrence.date.toISOString(),
      attendees: occurrence._count.attendees,
    })),
    registrationSeries,
    placement: {
      inGroup,
      membersUnassigned,
      guestsUnassigned,
    },
    unassignedCount: participantsWithoutSmallGroup.length,
    pipeline: {
      registered: event._count.registrants,
      attended: uniqueAttendees,
      inSmallGroup: inGroup,
      newTimothys,
      newLeaders,
    },
    confirmedGuestsCount,
    seriesSummaries: recurringSeriesSummaries.map((series) => ({
      id: series.id,
      title: series.title,
      startDate: series.startDate,
      endDate: series.endDate,
      sessionCount: series.sessionCount,
      totalAttendance: series.totalAttendance,
      averageAttendance: series.averageAttendance,
    })),
    confirmedVolunteerCount,
    pendingVolunteerCount,
    rejectedVolunteerCount,
    brandBackground,
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

  const normalizedPeriod: PeriodFilter = ["7d", "30d", "90d", "all"].includes(period)
    ? period
    : "30d"

  let event = await getEventDashboard(id, normalizedPeriod)
  if (!event) notFound()

  // Ensure MultiDay occurrences are up to date
  if (event.type === "MultiDay") {
    await ensureMultiDayOccurrences(
      event.id,
      new Date(event.startDate),
      new Date(event.endDate)
    )
    event = await getEventDashboard(id, normalizedPeriod)
    if (!event) notFound()
  }

  return (
    <EventDashboardClient event={event} />
  )
}
