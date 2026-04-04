"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { IconCalendar, IconPlus } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DataTable } from "@/components/ui/data-table"

type Event = {
  id: string
  name: string
  ministry: string
  date: string
  registration: string
  isPaid: boolean
  registrantCount: number
}

const columns: ColumnDef<Event>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "ministry",
    header: "Ministry",
  },
  {
    accessorKey: "date",
    header: "Date",
  },
  {
    accessorKey: "registration",
    header: "Registration",
  },
  {
    accessorKey: "isPaid",
    header: "Payment",
    cell: ({ row }) => (row.original.isPaid ? "Paid" : "Free"),
  },
  {
    accessorKey: "registrantCount",
    header: "Registrants",
  },
]

function EventCard({ event }: { event: Event }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="font-medium leading-tight">{event.name}</p>
        <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">Ministry</span>
          <span>{event.ministry}</span>
          <span className="text-muted-foreground">Date</span>
          <span>{event.date}</span>
          <span className="text-muted-foreground">Registration</span>
          <span>{event.registration}</span>
          <span className="text-muted-foreground">Payment</span>
          <span>{event.isPaid ? "Paid" : "Free"}</span>
          <span className="text-muted-foreground">Registrants</span>
          <span>{event.registrantCount}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default function EventsPage() {
  const data: Event[] = []

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Events</h2>
          <p className="text-sm text-muted-foreground">Manage church events and registrations</p>
        </div>
        <Button>
          <IconPlus />
          Add Event
        </Button>
      </div>

      {/* Mobile card list */}
      <div className="flex flex-col gap-3 md:hidden">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <IconCalendar className="size-8" />
            <p className="text-sm">No events yet</p>
          </div>
        ) : (
          data.map((event) => <EventCard key={event.id} event={event} />)
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={data}
          emptyState={
            <>
              <IconCalendar className="size-8" />
              <p className="text-sm">No events yet</p>
            </>
          }
        />
      </div>
    </div>
  )
}
