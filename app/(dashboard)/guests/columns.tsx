"use client"

import { type ColumnDef } from "@tanstack/react-table"

export type GuestRow = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  lifeStage: string | null
  eventCount: number
  dateAdded: string
}

export function buildColumns(): ColumnDef<GuestRow>[] {
  return [
    {
      accessorFn: (row) => `${row.firstName} ${row.lastName}`,
      id: "name",
      header: "Name",
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
