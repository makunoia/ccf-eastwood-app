"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { type ColumnDef } from "@tanstack/react-table"
import { IconDots, IconEye, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { deleteEvent } from "./actions"

export type EventRow = {
  id: string
  name: string
  ministries: { id: string; name: string }[]
  startDate: string
  endDate: string
  price: number | null
  registrationStart: string | null
  registrationEnd: string | null
  registrantCount: number
  // for edit form
  description: string | null
  type: "OneTime" | "MultiDay" | "Recurring"
  recurrenceDayOfWeek: number | null
  recurrenceFrequency: "Weekly" | "Biweekly" | "Monthly" | null
  recurrenceEndDate: string | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start)
  const e = new Date(end)
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }
  if (s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${s.toLocaleDateString("en-PH", opts)} – ${e.toLocaleDateString("en-PH", { ...opts, year: "numeric" })}`
  }
  return `${formatDate(start)} – ${formatDate(end)}`
}

export function RowActions({ row }: { row: EventRow }) {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteEvent(row.id)
    setDeleting(false)
    if (result.success) {
      toast.success("Event deleted")
      setDeleteOpen(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <span className="sr-only">Open menu</span>
            <IconDots className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => router.push(`/event/${row.id}/dashboard`)}>
            <IconEye className="mr-2 size-4" />
            View
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <IconTrash className="mr-2 size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete event</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">{row.name}</span>? This will also
              delete all registrants and breakout groups. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function buildColumns(): ColumnDef<EventRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
    },
    {
      id: "ministry",
      header: "Ministry",
      cell: ({ row }) => {
        const { ministries } = row.original
        if (ministries.length === 0) return <span className="text-muted-foreground">—</span>
        return ministries.map((m) => m.name).join(", ")
      },
    },
    {
      id: "date",
      header: "Date",
      cell: ({ row }) =>
        formatDateRange(row.original.startDate, row.original.endDate),
    },
    {
      id: "registration",
      header: "Registration",
      cell: ({ row }) => {
        const { registrationStart, registrationEnd } = row.original
        if (!registrationStart || !registrationEnd)
          return <span className="text-muted-foreground">—</span>
        return formatDateRange(registrationStart, registrationEnd)
      },
    },
    {
      accessorKey: "price",
      header: "Price",
      cell: ({ row }) =>
        row.original.price != null
          ? `₱${(row.original.price / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
          : "Free",
    },
    {
      accessorKey: "registrantCount",
      header: "Registrants",
    },
    {
      id: "actions",
      cell: ({ row }) => <RowActions row={row.original} />,
    },
  ]
}
