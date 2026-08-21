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

import { formatDate, formatDateRange } from "@/lib/format/date-range"

export type EventRow = {
  id: string
  name: string
  ministries: { id: string; name: string }[]
  allMinistries: boolean
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
      meta: { label: "Name", width: "name", locked: true },
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
      meta: { label: "Ministry", width: "name" },
      cell: ({ row }) => {
        const { ministries } = row.original
        if (ministries.length === 0) return <span className="text-muted-foreground">—</span>
        return ministries.map((m) => m.name).join(", ")
      },
    },
    {
      id: "date",
      header: "Date",
      meta: { label: "Date", width: "date" },
      cell: ({ row }) => {
        const { type, startDate, endDate } = row.original
        // A OneTime event happens on a single day — never show it as a range,
        // even if an older row carries a drifted endDate.
        if (type === "OneTime") return formatDate(startDate)
        return formatDateRange(startDate, endDate)
      },
    },
    {
      id: "registration",
      header: "Registration",
      meta: { label: "Registration", width: "text" },
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
      meta: { label: "Price", width: "text" },
      cell: ({ row }) =>
        row.original.price != null
          ? `₱${(row.original.price / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
          : "Free",
    },
    {
      accessorKey: "registrantCount",
      header: "Registrants",
      meta: { label: "Registrants", width: "text" },
    },
    {
      id: "actions",
      meta: { width: "actions", locked: true },
      cell: ({ row }) => <RowActions row={row.original} />,
    },
  ]
}
