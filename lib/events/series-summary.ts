import type { PrismaClient } from "@/app/generated/prisma/client"
import { groupOccurrencesBySeries, type GroupedOccurrenceSeries } from "./occurrence-series"

/**
 * Loads series-level attendance rollups for a Recurring event.
 *
 * Series summaries are whole-series aggregates and must reflect *every* session
 * in the series — they are deliberately NOT bounded by the dashboard's rolling
 * period window (which excludes future sessions and sessions older than the
 * selected range). The period filter belongs only to the attendance chart and
 * period totals, never here.
 */
export async function loadRecurringSeriesSummaries(
  db: PrismaClient,
  eventId: string,
): Promise<GroupedOccurrenceSeries[]> {
  const [ranges, occurrences] = await Promise.all([
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
  ])

  return groupOccurrencesBySeries(
    ranges,
    occurrences.map((occurrence) => ({
      id: occurrence.id,
      date: occurrence.date,
      isOpen: occurrence.isOpen,
      isStandalone: occurrence.isStandalone,
      attendeeCount: occurrence._count.attendees,
      seriesId: occurrence.seriesId,
    })),
  ).groups
}
