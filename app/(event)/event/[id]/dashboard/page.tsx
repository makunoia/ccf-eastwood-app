import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { EventDashboardClient } from "./dashboard-client"
import { ensureMultiDayOccurrences } from "@/app/(dashboard)/events/actions"

async function getEventDashboard(id: string) {
  return db.event.findUnique({
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
      _count: {
        select: { registrants: true, occurrences: true },
      },
      registrants: {
        select: { isPaid: true, attendedAt: true },
      },
      occurrences: {
        select: { _count: { select: { attendees: true } } },
      },
    },
  })
}

export default async function EventDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let event = await getEventDashboard(id)
  if (!event) notFound()

  // Ensure MultiDay occurrences are up to date
  if (event.type === "MultiDay") {
    await ensureMultiDayOccurrences(event.id, event.startDate, event.endDate)
    event = await getEventDashboard(id)
    if (!event) notFound()
  }

  const paidCount = event.registrants.filter((r) => r.isPaid).length
  const attendedCount = event.registrants.filter((r) => r.attendedAt).length
  const totalCheckIns = event.occurrences.reduce((sum, o) => sum + o._count.attendees, 0)

  return (
    <EventDashboardClient
      event={{
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
      }}
    />
  )
}
