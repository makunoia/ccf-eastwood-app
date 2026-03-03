"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { IconCalendar, IconPlus } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
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
  )
}
