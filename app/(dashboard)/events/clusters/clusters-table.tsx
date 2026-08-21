"use client"

import Link from "next/link"
import { type ColumnDef } from "@tanstack/react-table"

import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table"

/**
 * The cluster list, as a client component.
 *
 * The page above it is a server component and column definitions carry `cell`
 * render functions, which can't cross that boundary — so the page serialises
 * its rows and this renders them.
 */

export type ClusterListRow = {
  id: string
  name: string
  /** ISO, or null for a dateless cluster. */
  date: string | null
  isOpen: boolean
  eventNames: string[]
  peopleCount: number
}

const columns: ColumnDef<ClusterListRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { label: "Name", width: "name", locked: true },
    cell: ({ row }) => (
      <Link
        href={`/cluster/${row.original.id}`}
        className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "date",
    header: "Date",
    meta: { label: "Date", width: "date" },
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.date
          ? new Date(row.original.date).toLocaleDateString("en-PH", {
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            })
          : "—"}
      </span>
    ),
  },
  {
    id: "events",
    accessorFn: (row) => row.eventNames.join(" · "),
    header: "Events",
    meta: { label: "Events", width: "wide" },
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.eventNames.length === 0
          ? "No events"
          : row.original.eventNames.join(" · ")}
      </span>
    ),
  },
  {
    accessorKey: "peopleCount",
    header: "People registered",
    meta: { label: "People registered", width: "narrow", align: "right" },
    cell: ({ row }) => <span className="tabular-nums">{row.original.peopleCount}</span>,
  },
  {
    id: "form",
    accessorFn: (row) => (row.isOpen ? "Open" : "Closed"),
    header: "Form",
    meta: { label: "Form", width: "narrow" },
    cell: ({ row }) => (
      <Badge variant={row.original.isOpen ? "default" : "outline"}>
        {row.original.isOpen ? "Open" : "Closed"}
      </Badge>
    ),
  },
]

export function ClustersTable({ clusters }: { clusters: ClusterListRow[] }) {
  return <DataTable tableKey="event-clusters" rowLabel={{ one: "cluster", many: "clusters" }} columns={columns} data={clusters} />
}
