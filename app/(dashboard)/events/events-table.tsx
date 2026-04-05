"use client"

import { useRouter } from "next/navigation"
import { IconCalendar } from "@tabler/icons-react"

import { DataTable } from "@/components/ui/data-table"
import { Card, CardContent } from "@/components/ui/card"
import { buildColumns, type EventRow, RowActions } from "./columns"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function EventCard({ event }: { event: EventRow }) {
  const router = useRouter()

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => router.push(`/events/${event.id}`)}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-tight">{event.name}</p>
          <div onClick={(e) => e.stopPropagation()}>
            <RowActions row={event} />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">Ministry</span>
          <span>{event.ministry}</span>
          <span className="text-muted-foreground">Date</span>
          <span>
            {formatDate(event.startDate)}
            {event.startDate !== event.endDate && ` – ${formatDate(event.endDate)}`}
          </span>
          <span className="text-muted-foreground">Price</span>
          <span>
            {event.price != null
              ? `₱${(event.price / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
              : "Free"}
          </span>
          <span className="text-muted-foreground">Registrants</span>
          <span>{event.registrantCount}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function EventsTable({ events }: { events: EventRow[] }) {
  const columns = buildColumns()

  return (
    <>
      {/* Mobile card list */}
      <div className="flex flex-col gap-3 md:hidden">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <IconCalendar className="size-8" />
            <p className="text-sm">No events yet</p>
          </div>
        ) : (
          events.map((event) => <EventCard key={event.id} event={event} />)
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={events}
          emptyState={
            <>
              <IconCalendar className="size-8" />
              <p className="text-sm">No events yet</p>
            </>
          }
        />
      </div>
    </>
  )
}
