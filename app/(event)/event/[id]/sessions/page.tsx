import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { SessionsClient } from "./sessions-client"
import { ensureMultiDayOccurrences } from "@/app/(dashboard)/events/actions"
import { groupOccurrencesBySeries } from "@/lib/events/occurrence-series"

async function getEventSessions(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      startDate: true,
      endDate: true,
      occurrences: {
        orderBy: { date: "asc" },
        select: {
          id: true,
          date: true,
          isOpen: true,
          isStandalone: true,
          seriesId: true,
          // Total check-ins — includes both participant and volunteer attendance.
          _count: { select: { attendees: true } },
        },
      },
      occurrenceSeries: {
        orderBy: { startDate: "desc" },
        select: {
          id: true,
          title: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  })
}

export default async function SessionsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let event = await getEventSessions(id)
  if (!event) notFound()

  // For recurring events, order most-recent first; for multiday, ensure occurrences
  if (event.type === "MultiDay") {
    await ensureMultiDayOccurrences(event.id, event.startDate, event.endDate)
    event = await getEventSessions(id)
    if (!event) notFound()
  }

  const recurringGroups =
    event.type === "Recurring"
      ? groupOccurrencesBySeries(
          event.occurrenceSeries,
          event.occurrences.map((occurrence) => ({
            id: occurrence.id,
            date: occurrence.date,
            isOpen: occurrence.isOpen,
            isStandalone: occurrence.isStandalone,
            attendeeCount: occurrence._count.attendees,
            seriesId: occurrence.seriesId,
          })),
        )
      : null

  const occurrences =
    event.type === "Recurring"
      ? []
      : event.occurrences.map((o) => ({
          id: o.id,
          date: o.date.toISOString(),
          isOpen: o.isOpen,
          attendeeCount: o._count.attendees,
          isStandalone: o.isStandalone,
          seriesId: o.seriesId,
        }))

  return (
    <SessionsClient
      eventId={event.id}
      eventType={event.type}
      occurrences={occurrences}
      seriesGroups={recurringGroups?.groups ?? []}
      ungroupedOccurrences={recurringGroups?.ungrouped ?? []}
      seriesOptions={event.occurrenceSeries.map((series) => ({
        id: series.id,
        title: series.title,
        startDate: series.startDate.toISOString(),
        endDate: series.endDate.toISOString(),
      }))}
    />
  )
}
