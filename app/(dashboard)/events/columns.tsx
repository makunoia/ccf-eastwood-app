"use client"

import { useRouter } from "next/navigation"
import { type ColumnDef } from "@tanstack/react-table"
import { IconDots, IconEye } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Link from "next/link"

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

  return (
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function buildColumns(): ColumnDef<EventRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <Link
          href={`/event/${row.original.id}/dashboard`}
          className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
        >
          {row.original.name}
        </Link>
      ),
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
