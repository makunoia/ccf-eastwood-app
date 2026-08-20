"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  SubmissionDecisions,
  type SubmissionDecision,
} from "@/components/catch-mech/submission-decisions"
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
import { CopyCatchMechLink } from "./copy-catch-mech-link"

export type SubmissionRow = {
  id: string
  submittedByName: string
  breakoutGroupId: string | null
  breakoutGroupName: string | null
  confirmedCount: number
  declinedCount: number
  deferredCount: number
  createdGroupId: string | null
  /** The actual people this submission decided on, in submission order. */
  decisions: SubmissionDecision[]
  createdAt: Date
}

export type NonResponder = {
  volunteerId: string
  name: string
  breakoutGroupId: string
  breakoutGroupName: string
}

type Props = {
  eventId: string
  rows: SubmissionRow[]
  nonResponders: NonResponder[]
  respondedCount: number
  expectedCount: number
  breakoutGroups: { id: string; name: string }[]
  canViewMember: boolean
  canViewSmallGroup: boolean
}

function formatDateTime(d: Date): string {
  return new Date(d).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  })
}

function buildSubmissionColumns({
  eventId,
  expanded,
}: {
  eventId: string
  expanded: Set<string>
}): ColumnDef<SubmissionRow>[] {
  return [
    {
      id: "expander",
      // No label, so the picker treats it as plumbing and never offers it.
      meta: { width: "micro", locked: true, stopRowClick: true },
      cell: ({ row }) => {
        // A submission from before this trail existed has counts but no stored
        // names, so the expander is driven by what we can actually show.
        if (row.original.decisions.length === 0) return null
        const isOpen = expanded.has(row.original.id)
        return (
          <span
            aria-hidden
            className="inline-flex rounded-md p-1 text-muted-foreground transition-colors"
          >
            <ChevronRight className={`size-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
          </span>
        )
      },
    },
    {
      accessorKey: "submittedByName",
      header: "Facilitator",
      meta: { label: "Facilitator", width: "name", noTruncate: true },
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{row.original.submittedByName}</span>
          {row.original.createdGroupId && (
            <Badge variant="secondary" className="shrink-0">
              Created group
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "breakoutGroup",
      accessorFn: (row) => row.breakoutGroupName ?? "",
      header: "Breakout Group",
      meta: { label: "Breakout Group", width: "name", stopRowClick: true },
      cell: ({ row }) =>
        row.original.breakoutGroupId && row.original.breakoutGroupName ? (
          <Link
            href={`/event/${eventId}/breakouts/${row.original.breakoutGroupId}`}
            className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
          >
            {row.original.breakoutGroupName}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "confirmedCount",
      header: "Confirmed",
      meta: { label: "Confirmed", width: "narrow", align: "right" },
      cell: ({ row }) => <span className="tabular-nums">{row.original.confirmedCount}</span>,
    },
    {
      accessorKey: "declinedCount",
      header: "Declined",
      meta: { label: "Declined", width: "narrow", align: "right" },
      cell: ({ row }) => <span className="tabular-nums">{row.original.declinedCount}</span>,
    },
    {
      accessorKey: "deferredCount",
      header: "Deferred",
      meta: { label: "Deferred", width: "narrow", align: "right" },
      cell: ({ row }) => <span className="tabular-nums">{row.original.deferredCount}</span>,
    },
    {
      accessorKey: "createdAt",
      header: "Submitted",
      meta: { label: "Submitted", width: "date" },
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>
      ),
    },
  ]
}

function buildNonResponderColumns(eventId: string): ColumnDef<NonResponder>[] {
  return [
    {
      accessorKey: "name",
      header: "Facilitator",
      meta: { label: "Facilitator", width: "name", locked: true },
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "breakoutGroupName",
      header: "Breakout Group",
      meta: { label: "Breakout Group", width: "name" },
      cell: ({ row }) => (
        <Link
          href={`/event/${eventId}/breakouts/${row.original.breakoutGroupId}`}
          className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
        >
          {row.original.breakoutGroupName}
        </Link>
      ),
    },
  ]
}

export function SubmissionsClient({
  eventId,
  rows,
  nonResponders,
  respondedCount,
  expectedCount,
  breakoutGroups,
  canViewMember,
  canViewSmallGroup,
}: Props) {
  const [filterGroup, setFilterGroup] = React.useState("all")
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const columns = React.useMemo(
    () => buildSubmissionColumns({ eventId, expanded }),
    [eventId, expanded],
  )
  const nonResponderColumns = React.useMemo(
    () => buildNonResponderColumns(eventId),
    [eventId],
  )

  function toggleRow(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredRows =
    filterGroup === "all" ? rows : rows.filter((r) => r.breakoutGroupId === filterGroup)
  const filteredNonResponders =
    filterGroup === "all"
      ? nonResponders
      : nonResponders.filter((n) => n.breakoutGroupId === filterGroup)

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
        <span className="text-foreground font-medium">Submissions</span>
      </nav>

      <PageHeader
        title="Submissions"
        description={`${respondedCount} of ${expectedCount} facilitators responded`}
        actions={
          <div className="flex items-center gap-2">
            {/* One event-level entry URL serves every facilitator, so it belongs
                here rather than repeated down a table column. Per-faci tokens are
                minted when they verify their mobile — there is no per-row link. */}
            <CopyCatchMechLink path={`/events/${eventId}/catch-mech`} />
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
                      <SelectItem key={bg.id} value={bg.id}>
                        {bg.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            </FilterBar>
          </div>
        }
      />

      {/* Every submission, newest first. Repeat submissions are separate rows on
          purpose — a faci answering twice is exactly what this page exists to show. */}
      <DataTable
        tableKey="event.catch-mech-submissions"
        rowLabel={{ one: "submission", many: "submissions" }}
        columns={columns}
        data={filteredRows}
        emptyState={<p className="text-sm">No submissions yet</p>}
        onRowClick={(row) => {
          if (row.decisions.length > 0) toggleRow(row.id)
        }}
        renderSubRow={(row) =>
          expanded.has(row.id) && row.decisions.length > 0 ? (
            <div className="bg-muted/30 p-3">
              <SubmissionDecisions
                decisions={row.decisions}
                canViewMember={canViewMember}
                canViewSmallGroup={canViewSmallGroup}
              />
            </div>
          ) : null
        }
      />

      {/* Chase list */}
      <div className="space-y-3">
        <h3 className="type-label text-muted-foreground">
          No response yet ({filteredNonResponders.length})
        </h3>
        {filteredNonResponders.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Every facilitator has responded
          </p>
        ) : (
          <DataTable
            tableKey="event.catch-mech-nonresponders"
            rowLabel={{ one: "facilitator", many: "facilitators" }}
            columns={nonResponderColumns}
            data={filteredNonResponders}
            hidePagination
          />
        )}
      </div>
    </div>
  )
}
