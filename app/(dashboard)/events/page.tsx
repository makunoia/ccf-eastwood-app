import { db } from "@/lib/db"
import { type EventRow } from "./columns"
import { EventsTable } from "./events-table"
import { EventsToolbar } from "./toolbar"

async function getEvents(): Promise<EventRow[]> {
  const events = await db.event.findMany({
    orderBy: { startDate: "desc" },
    include: {
      ministry: { select: { id: true, name: true } },
      _count: { select: { registrants: true } },
    },
  })

  return events.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
    ministry: e.ministry.name,
    ministryId: e.ministryId,
    type: e.type,
    startDate: e.startDate.toISOString().split("T")[0],
    endDate: e.endDate.toISOString().split("T")[0],
    price: e.price,
    registrationStart: e.registrationStart
      ? e.registrationStart.toISOString().split("T")[0]
      : null,
    registrationEnd: e.registrationEnd
      ? e.registrationEnd.toISOString().split("T")[0]
      : null,
    registrantCount: e._count.registrants,
    recurrenceDayOfWeek: e.recurrenceDayOfWeek,
    recurrenceFrequency: e.recurrenceFrequency,
    recurrenceEndDate: e.recurrenceEndDate
      ? e.recurrenceEndDate.toISOString().split("T")[0]
      : null,
  }))
}

export default async function EventsPage() {
  const events = await getEvents()

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Events</h2>
          <p className="text-sm text-muted-foreground">
            Manage church events and registrations
          </p>
        </div>
        <EventsToolbar />
      </div>

      <EventsTable events={events} />
    </div>
  )
}
