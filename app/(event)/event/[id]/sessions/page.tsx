import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { SessionsClient } from "./sessions-client"
import { ensureMultiDayOccurrences } from "@/app/(dashboard)/events/actions"

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
          _count: { select: { attendees: true } },
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

  // Recurring: most-recent first
  const occurrences =
    event.type === "Recurring"
      ? [...event.occurrences].reverse()
      : event.occurrences

  return (
    <SessionsClient
      eventId={event.id}
      eventType={event.type}
      occurrences={occurrences.map((o) => ({
        id: o.id,
        date: o.date.toISOString(),
        isOpen: o.isOpen,
        attendeeCount: o._count.attendees,
      }))}
    />
  )
}
