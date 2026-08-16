import type { PrismaClient } from "@/app/generated/prisma/client"
import { groupOccurrencesBySeries, type GroupedOccurrenceSeries } from "./occurrence-series"

export type RecurringSeriesSummary = GroupedOccurrenceSeries & {
  /** Volunteer check-ins across the series — not part of `totalAttendance`. */
  volunteerAttendance: number
  /** `totalAttendance + volunteerAttendance`; reconciles with the Sessions page. */
  totalCheckIns: number
}

/**
 * Loads series-level attendance rollups for a Recurring event.
 *
 * Series summaries are whole-series aggregates and must reflect *every* session
 * in the series — they are deliberately NOT bounded by the dashboard's rolling
 * period window (which excludes future sessions and sessions older than the
 * selected range). The period filter belongs only to the attendance chart and
 * period totals, never here.
 *
 * `totalAttendance` counts participants only, matching every other attendance
 * figure on the dashboard. The Sessions page counts volunteers in the same
 * rollup, so `volunteerAttendance` is carried alongside and surfaced in the
 * chart's tooltip — the two screens reported different numbers for the same
 * series with nothing on either to explain the gap.
 */
export async function loadRecurringSeriesSummaries(
  db: PrismaClient,
  eventId: string,
): Promise<RecurringSeriesSummary[]> {
  const [ranges, occurrences, volunteerCheckIns] = await Promise.all([
    db.eventOccurrenceSeries.findMany({
      where: { eventId },
      orderBy: { startDate: "desc" },
      select: { id: true, title: true, startDate: true, endDate: true },
    }),
    db.eventOccurrence.findMany({
      where: { eventId },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        isOpen: true,
        isStandalone: true,
        seriesId: true,
        // Participant attendance only — volunteer check-ins are tracked separately.
        _count: { select: { attendees: { where: { registrantId: { not: null } } } } },
      },
    }),
    // Aggregated in the database rather than by pulling attendee rows — a long
    // series on a busy event is a lot of rows.
    db.occurrenceAttendee.groupBy({
      by: ["occurrenceId"],
      where: { volunteerId: { not: null }, occurrence: { eventId } },
      _count: { _all: true },
    }),
  ])

  const volunteersByOccurrence = new Map(
    volunteerCheckIns.map((row) => [row.occurrenceId, row._count._all]),
  )

  const groups = groupOccurrencesBySeries(
    ranges,
    occurrences.map((occurrence) => {
      const volunteers = volunteersByOccurrence.get(occurrence.id) ?? 0
      return {
        id: occurrence.id,
        date: occurrence.date,
        isOpen: occurrence.isOpen,
        isStandalone: occurrence.isStandalone,
        attendeeCount: occurrence._count.attendees,
        // A session staffed by volunteers alone has still happened.
        hasCheckIns: occurrence._count.attendees > 0 || volunteers > 0,
        seriesId: occurrence.seriesId,
      }
    }),
  ).groups

  return groups.map((group) => {
    const volunteerAttendance = group.occurrences.reduce(
      (sum, occurrence) => sum + (volunteersByOccurrence.get(occurrence.id) ?? 0),
      0,
    )
    return {
      ...group,
      volunteerAttendance,
      totalCheckIns: group.totalAttendance + volunteerAttendance,
    }
  })
}
