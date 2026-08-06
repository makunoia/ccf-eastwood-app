import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { EventDashboardClient } from "./dashboard-client"
import { ensureMultiDayOccurrences } from "@/app/(dashboard)/events/actions"
import { loadRecurringSeriesSummaries } from "@/lib/events/series-summary"
import {
  loadEventAttendanceBreakdown,
  shouldExplainMissingLifeStage,
} from "@/lib/events/attendance-breakdown"
import { getEffectiveFormConfigs } from "@/lib/forms/context-config-server"
import { buildTurnout } from "@/lib/events/turnout"
import { buildAttendanceSeries } from "@/lib/events/attendance-series"
import {
  buildDashboardPeriod,
  normalizePeriod,
  occurrenceWindowWhere,
  type PeriodFilter,
} from "@/lib/events/dashboard-period"
import { getEventSetupChecklist } from "@/lib/events/setup-checklist"
import { getEventDashboardLayout } from "@/lib/events/dashboard-widgets-server"
import { visibleWidgetKeys, type DashboardWidgetKey } from "@/lib/events/dashboard-widgets"

export const metadata: Metadata = {
  title: "Dashboard",
}

type UngroupedParticipant = {
  id: string
  name: string
  type: "Member" | "Guest"
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

/**
 * Widgets the admin has switched on, used to skip work nothing will render.
 *
 * Only queries feeding exactly one widget are gated. `loadEventAttendanceBreakdown`
 * deliberately is not: its total is `uniqueAttendees`, which the Turnout tile and
 * the pipeline both read, so it stays the single source of truth regardless of
 * whether the Life Stage table is showing.
 */
async function getEventDashboard(
  id: string,
  period: PeriodFilter,
  shown: Set<DashboardWidgetKey>
) {
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
      setupDismissedAt: true,
      modules: { select: { type: true } },
      allMinistries: true,
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

  // Both bounds are snapped to UTC day boundaries. Occurrence dates are stored
  // at UTC midnight, so an un-snapped window drops today's session (until 08:00
  // PH) and the oldest day in the range. See lib/events/dashboard-period.ts.
  const { start: periodStart, end: periodEnd, occurrenceRange } = buildDashboardPeriod(
    period,
    event.startDate
  )
  // "All time" has no lower bound at all. Anchoring it to Event.startDate hides
  // anything dated earlier — a standalone session, a guest confirmed into a
  // DGroup before the event opened — which is exactly what "all time" promises
  // to show. Every period-bounded figure below uses this, not `periodStart`.
  const windowStart = period === "all" ? null : periodStart

  const occurrences =
    event.type === "OneTime"
      ? []
      : await db.eventOccurrence.findMany({
          // Not a plain `date: occurrenceRange` — a session opened for check-in
          // ahead of its own date already has attendance and must still plot.
          where: { eventId: event.id, ...occurrenceWindowWhere(occurrenceRange) },
          orderBy: { date: "asc" },
          select: {
            id: true,
            date: true,
            // Participant attendance only — volunteer check-ins (registrantId null) are
            // counted separately below so the chart can show both.
            _count: { select: { attendees: { where: { registrantId: { not: null } } } } },
          },
        })

  // Volunteer check-ins per occurrence, aggregated in the database rather than
  // by pulling attendee rows — a 90-day window on a busy event is a lot of rows.
  const volunteerCheckIns =
    occurrences.length === 0
      ? []
      : await db.occurrenceAttendee.groupBy({
          by: ["occurrenceId"],
          where: {
            volunteerId: { not: null },
            occurrenceId: { in: occurrences.map((occurrence) => occurrence.id) },
          },
          _count: { _all: true },
        })

  const attendanceSeries = buildAttendanceSeries(
    occurrences.map((occurrence) => ({
      occurrenceId: occurrence.id,
      date: occurrence.date,
      attendees: occurrence._count.attendees,
    })),
    new Map(volunteerCheckIns.map((row) => [row.occurrenceId, row._count._all]))
  )

  // Series summaries are whole-series rollups — they must reflect the entire
  // series, not the dashboard's rolling period window. Loaded via a dedicated
  // unfiltered query. See loadRecurringSeriesSummaries.
  const recurringSeriesSummaries =
    event.type === "Recurring" && shown.has("chartSeriesComparison")
      ? await loadRecurringSeriesSummaries(db, event.id)
      : []

  // First-timer / member / DGroup split per Life Stage (CCF-92). Its totals row
  // is the distinct-participant count for the period, so it also feeds the
  // "Unique Attendees" KPI — one source of truth for who attended.
  const attendanceBreakdown = await loadEventAttendanceBreakdown(
    db,
    event.id,
    event.type,
    windowStart,
    periodEnd
  )
  const uniqueAttendees = attendanceBreakdown.total.attendees

  // Life Stage is opt-in per form, and any of the three contexts can collect it —
  // a Recurring event may only ever ask at check-in. "Nothing collects it" is
  // therefore all three being off, not just Register.
  const formConfigs = await getEffectiveFormConfigs(event.id)
  const collectsLifeStage = Object.values(formConfigs).some((config) => config.fieldLifeStage)
  const explainMissingLifeStage = shouldExplainMissingLifeStage(
    attendanceBreakdown,
    collectsLifeStage
  )

  // Pre-registered vs actual check-ins (CCF-91). Shares the unique-attendee
  // count so turnout can never disagree with the KPI beside it.
  const turnout = buildTurnout(event._count.registrants, uniqueAttendees)

  // Feeds nothing but the pipeline card's footer, so it's skipped outright when
  // that card is hidden.
  const breakoutGroupIds = event.breakoutGroups.map((bg) => bg.id)
  const confirmedGuestRequests =
    breakoutGroupIds.length === 0 || !shown.has("chartPipeline")
      ? []
      : await db.smallGroupMemberRequest.findMany({
          where: {
            status: "Confirmed",
            memberId: { not: null },
            member: { guest: { isNot: null } },
            breakoutGroupId: { in: breakoutGroupIds },
            resolvedAt: {
              not: null,
              ...(windowStart ? { gte: windowStart } : {}),
              lte: periodEnd,
            },
          },
          select: {
            id: true,
            member: { select: { smallGroupId: true } },
          },
        })

  const paidCount = event.registrants.filter((r) => r.isPaid).length
  // OneTime attendance is period-bounded like every other attendance figure, so
  // "Total Attended" and "Unique Attendees" can no longer disagree.
  const attendedCount = event.registrants.filter(
    (r) =>
      r.attendedAt && (!windowStart || r.attendedAt >= windowStart) && r.attendedAt <= periodEnd
  ).length
  const totalCheckIns =
    event.type === "OneTime" ? attendedCount : attendanceSeries.totalAttendees
  const averageAttendance =
    event.type === "OneTime" ? attendedCount : attendanceSeries.averageAttendance

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
    if (windowStart && member.updatedAt < windowStart) continue
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
    setupDismissedAt: event.setupDismissedAt,
    modules: event.modules.map((m) => m.type),
    startDate: event.startDate.toISOString(),
    endDate: event.endDate.toISOString(),
    price: event.price,
    registrationStart: event.registrationStart?.toISOString() ?? null,
    registrationEnd: event.registrationEnd?.toISOString() ?? null,
    recurrenceDayOfWeek: event.recurrenceDayOfWeek,
    recurrenceFrequency: event.recurrenceFrequency,
    recurrenceEndDate: event.recurrenceEndDate?.toISOString() ?? null,
    ministries: event.ministries.map((em) => em.ministry.name),
    allMinistries: event.allMinistries,
    registrantCount: event._count.registrants,
    paidCount,
    attendedCount,
    occurrenceCount: event._count.occurrences,
    totalCheckIns,
    totalVolunteerCheckIns: attendanceSeries.totalVolunteers,
    sessionsInPeriod: attendanceSeries.sessionCount,
    period,
    averageAttendance,
    uniqueAttendees,
    turnout,
    attendanceSeries: attendanceSeries.points,
    registrationSeries,
    attendanceBreakdown,
    explainMissingLifeStage,
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
  const normalizedPeriod: PeriodFilter = normalizePeriod(sp.period as string | undefined)

  // Cheap lookup of the few facts needed before the main query can run: the type
  // and modules that resolve the layout, and the date range MultiDay occurrences
  // are generated from.
  const meta = await db.event.findUnique({
    where: { id },
    select: { type: true, startDate: true, endDate: true, modules: { select: { type: true } } },
  })
  if (!meta) notFound()

  // Generated *before* the dashboard query rather than after it. Doing this
  // afterwards meant a MultiDay event had to run the whole query a second time to
  // pick up the occurrences it had just created — the single most expensive
  // statement on the page, run twice on every load.
  if (meta.type === "MultiDay") {
    await ensureMultiDayOccurrences(id, meta.startDate, meta.endDate)
  }

  const layout = await getEventDashboardLayout(
    id,
    meta.type,
    meta.modules.map((m) => m.type)
  )
  const shown = visibleWidgetKeys(layout)

  const event = await getEventDashboard(id, normalizedPeriod, shown)
  if (!event) notFound()

  // Setup walkthrough — only built while the admin hasn't dismissed it.
  const setup = event.setupDismissedAt
    ? null
    : await getEventSetupChecklist(event.id, event.type, event.modules)

  return <EventDashboardClient event={event} setup={setup} layout={layout} />
}
