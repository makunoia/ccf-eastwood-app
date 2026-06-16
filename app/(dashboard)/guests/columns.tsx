"use client"

import Link from "next/link"
import { type ColumnDef } from "@tanstack/react-table"

import { buildSelectionColumn } from "@/components/batch/selection-column"

export type GuestRow = {
  id: string
  firstName: string
  lastName: string
  nickname: string | null
  email: string | null
  phone: string | null
  lifeStage: string | null
  eventCount: number
  dateAdded: string
  // Extra fields used by Export — not displayed in the table
  gender: string | null
  language: string[]
  birthMonth: number | null
  birthYear: number | null
  workCity: string | null
  workIndustry: string | null
  meetingPreference: string | null
  notes: string | null
}

export function buildColumns(selectable = false): ColumnDef<GuestRow>[] {
  return [
    ...(selectable ? [buildSelectionColumn<GuestRow>()] : []),
    {
      accessorFn: (row) => `${row.nickname?.trim() || row.firstName} ${row.lastName}`,
      id: "name",
      header: "Name",
      cell: ({ row, table }) => {
        const ids = table.getRowModel().rows.map((r) => (r.original as GuestRow).id)
        const preferredFirstName = row.original.nickname?.trim() || row.original.firstName
        return (
          <Link
            href={`/guests/${row.original.id}`}
            onClick={() => sessionStorage.setItem("guestListIds", JSON.stringify(ids))}
            className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
          >
            {preferredFirstName} {row.original.lastName}
          </Link>
        )
      },
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) =>
        row.original.email ?? (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "phone",
      header: "Mobile",
      cell: ({ row }) =>
        row.original.phone ?? (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "eventCount",
      header: "Events",
    },
    {
      accessorKey: "lifeStage",
      header: "Life Stage",
      cell: ({ row }) =>
        row.original.lifeStage ?? (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "dateAdded",
      header: "Date Added",
      cell: ({ row }) =>
        new Date(row.original.dateAdded).toLocaleDateString("en-PH", {
          year: "numeric",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }),
    },
  ]
}
