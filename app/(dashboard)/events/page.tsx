import { EventType, Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { type EventRow } from "./columns"
import { EventsTable } from "./events-table"
import { EventsToolbar } from "./toolbar"
import { EventsFilters } from "./events-filters"

async function getEvents(where: Prisma.EventWhereInput): Promise<EventRow[]> {
  const events = await db.event.findMany({
    where,
    orderBy: { startDate: "desc" },
    include: {
      ministries: { include: { ministry: { select: { id: true, name: true } } } },
      _count: { select: { registrants: true } },
    },
  })

  return events.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
    ministries: e.ministries.map((em) => em.ministry),
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

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const search = (params.search as string) || ""
  const ministryId = (params.ministryId as string) || ""
  const type = (params.type as string) || ""
  const dateFrom = (params.dateFrom as string) || ""
  const dateTo = (params.dateTo as string) || ""

  const where: Prisma.EventWhereInput = {
    AND: [
      search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : {},
      ministryId
        ? { ministries: { some: { ministryId } } }
        : {},
      type ? { type: type as EventType } : {},
      dateFrom ? { startDate: { gte: new Date(dateFrom) } } : {},
      dateTo ? { startDate: { lte: new Date(`${dateTo}T23:59:59.999Z`) } } : {},
    ],
  }

  const [events, ministries] = await Promise.all([
    getEvents(where),
    db.ministry.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ])

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

      <EventsFilters
        key={`${search}-${ministryId}-${type}-${dateFrom}-${dateTo}`}
        ministries={ministries}
        search={search}
        ministryId={ministryId}
        type={type}
        dateFrom={dateFrom}
        dateTo={dateTo}
      />

      <EventsTable events={events} />
    </div>
  )
}
