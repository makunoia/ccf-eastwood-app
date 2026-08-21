import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canExport } from "@/lib/permissions"
import { SessionsClient } from "./sessions-client"
import { ensureMultiDayOccurrences } from "@/app/(dashboard)/events/actions"
import { groupOccurrencesBySeries } from "@/lib/events/occurrence-series"
import { loadSessionTurnout } from "@/lib/events/session-turnout"
import { utcToday } from "@/lib/events/checkin-link"

async function getEventSessions(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
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

// Mirrors the in-page header, which reads "Sessions" only for Recurring events.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const event = await db.event.findUnique({ where: { id }, select: { type: true } })
  return { title: event?.type === "Recurring" ? "Sessions" : "Days" }
}

export default async function SessionsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  let event = await getEventSessions(id)
  if (!event) notFound()

  // For recurring events, order most-recent first; for multiday, ensure occurrences
  if (event.type === "MultiDay") {
    await ensureMultiDayOccurrences(event.id, event.startDate, event.endDate)
    event = await getEventSessions(id)
    if (!event) notFound()
  }

  // The turnout ratio each row shows. `_count.attendees` above can't serve as its
  // numerator — it counts volunteer check-ins too, and volunteers hold no
  // registration to divide by. Loaded after the MultiDay top-up so a day created
  // just now is present in the map.
  const { totalRegistrants, participantsByOccurrence } = await loadSessionTurnout(db, id)

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
            participantCount: participantsByOccurrence.get(occurrence.id) ?? 0,
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
          participantCount: participantsByOccurrence.get(o.id) ?? 0,
          isStandalone: o.isStandalone,
          seriesId: o.seriesId,
        }))

  return (
    <SessionsClient
      eventId={event.id}
      eventName={event.name}
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
      canExport={canExport(session, "Events")}
      totalRegistrants={totalRegistrants}
      today={utcToday()}
    />
  )
}
