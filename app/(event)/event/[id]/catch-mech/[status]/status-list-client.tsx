"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { FilterBar, FilterField } from "@/components/filter-bar"
import { PageHeader } from "@/components/page-header"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DataTable } from "@/components/ui/data-table"
import { CatchMechUndoButton } from "../catch-mech-undo-button"
import { SLUG_CONFIG, type CatchMechSlug } from "../status-slug"

export type StatusListRow = {
  requestId: string
  registrantId: string
  name: string
  type: "Member" | "Guest"
  breakoutGroupName: string
  smallGroupName: string | null  // null for the declined statuses
  declineReason: string | null   // display string, only set for declined rows
  rejectedByName: string | null  // facilitator name, only set for declined rows
}

type Props = {
  rows: StatusListRow[]
  status: CatchMechSlug
  eventId: string
  breakoutGroups: { id: string; name: string }[]
}

function buildColumns({
  eventId,
  status,
  isDeclined,
  canUndo,
}: {
  eventId: string
  status: string
  isDeclined: boolean
  canUndo: boolean
}): ColumnDef<StatusListRow>[] {
  const blank = <span className="text-muted-foreground">—</span>
  return [
    {
      accessorKey: "name",
      header: "Name",
      meta: { label: "Name", width: "name", locked: true },
      cell: ({ row }) => (
        <Link
          href={`/event/${eventId}/catch-mech/${status}/${row.original.registrantId}`}
          className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      meta: { label: "Type", width: "narrow" },
      cell: ({ row }) => (
        <Badge variant={row.original.type === "Member" ? "secondary" : "outline"}>
          {row.original.type}
        </Badge>
      ),
    },
    {
      accessorKey: "breakoutGroupName",
      header: "Breakout Group",
      meta: { label: "Breakout Group", width: "name" },
    },
    isDeclined
      ? {
          accessorKey: "declineReason",
          header: "Reason",
          meta: { label: "Reason", width: "wide" },
          cell: ({ row }) => row.original.declineReason ?? blank,
        }
      : {
          accessorKey: "smallGroupName",
          header: "DGroup",
          meta: { label: "DGroup", width: "name" },
          cell: ({ row }) => row.original.smallGroupName ?? blank,
        },
    ...(isDeclined
      ? [
          {
            accessorKey: "rejectedByName",
            header: "Declined by",
            meta: { label: "Declined by", width: "name" },
            cell: ({ row }) => row.original.rejectedByName ?? blank,
          } satisfies ColumnDef<StatusListRow>,
        ]
      : []),
    ...(canUndo
      ? [
          {
            id: "actions",
            meta: { width: "actions", locked: true },
            cell: ({ row }) => (
              <CatchMechUndoButton
                requestId={row.original.requestId}
                eventId={eventId}
                decision={status === "confirmed" ? "Confirmed" : "Rejected"}
              />
            ),
          } satisfies ColumnDef<StatusListRow>,
        ]
      : []),
  ]
}

export function StatusListClient({ rows, status, eventId, breakoutGroups }: Props) {
  const [filterGroup, setFilterGroup] = React.useState("all")

  const filtered = filterGroup === "all"
    ? rows
    : rows.filter((r) => r.breakoutGroupName === filterGroup)

  const label = SLUG_CONFIG[status].label
  // Both declined slugs carry a reason and a decider; the reason is the entire point
  // of separating in-small-group out, so it shows there too.
  const isDeclined = status === "rejected" || status === "in-small-group"
  const canUndo = status !== "pending"

  // The empty-state colspan this used to compute is now DataTable's problem.
  const columns = React.useMemo(
    () => buildColumns({ eventId, status, isDeclined, canUndo }),
    [eventId, status, isDeclined, canUndo],
  )

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link
          href={`/event/${eventId}/catch-mech`}
          className="hover:text-foreground transition-colors"
        >
          Catch Mech
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="text-foreground font-medium">{label}</span>
      </nav>

      {/* Header + filter */}
      <PageHeader
        title={label}
        description={`${filtered.length} ${filtered.length === 1 ? "person" : "people"}`}
        actions={
          <FilterBar
            activeCount={filterGroup === "all" ? 0 : 1}
            onClear={() => setFilterGroup("all")}
          >
            <FilterField label="Group">
              <Select value={filterGroup} onValueChange={setFilterGroup}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All groups</SelectItem>
                  {breakoutGroups.map((bg) => (
                    <SelectItem key={bg.id} value={bg.name}>
                      {bg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          </FilterBar>
        }
      />

      {/* Table */}
      <DataTable
        tableKey={`event.catch-mech.${status}`}
        rowLabel={{ one: "registrant", many: "registrants" }}
        columns={columns}
        data={filtered}
        emptyState={
          <p className="text-sm">
            {status === "in-small-group"
              ? "No registrants were declined as already in a DGroup."
              : `No ${label.toLowerCase()} registrants.`}
          </p>
        }
      />
    </div>
  )
}
