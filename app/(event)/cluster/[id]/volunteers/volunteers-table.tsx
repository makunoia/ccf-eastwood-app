"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table"
import { emailColumn, phoneColumn } from "@/lib/tables/columns/contact"
import type { VolunteerStatus } from "@/app/generated/prisma/client"

export type ClusterVolunteerRow = {
  id: string
  status: VolunteerStatus
  notes: string | null
  member: {
    id: string
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
  }
  event: { id: string; name: string }
  committee: { id: string; name: string }
  preferredRole: { id: string; name: string }
  assignedRole: { id: string; name: string } | null
  /** Serving on more than one of the day's events. */
  servingInBoth: boolean
}

const STATUS_VARIANT: Record<VolunteerStatus, "default" | "secondary" | "destructive"> = {
  Confirmed: "default",
  Pending: "secondary",
  Rejected: "destructive",
}

/**
 * The day's serving team, one row per volunteer sign-up.
 *
 * Grouped visually by nothing and sorted by event, because the question this page
 * answers is "who is serving today" — an admin scanning for a name should not have
 * to know which ministry they came in through. The Event column carries that when
 * it matters.
 *
 * Read-and-navigate rather than edit-in-place: a volunteer belongs to their event,
 * so their detail page — where status, committee and role are changed — lives in
 * that event's workspace. Linking there keeps one owner for those writes instead of
 * a second set of controls that would have to stay in step.
 */
function buildColumns({
  canEdit,
  showEventColumn,
}: {
  canEdit: boolean
  showEventColumn: boolean
}): ColumnDef<ClusterVolunteerRow>[] {
  return [
    {
      id: "name",
      accessorFn: (row) => `${row.member.firstName} ${row.member.lastName}`,
      header: "Name",
      meta: { label: "Name", width: "name", locked: true, noTruncate: true },
      cell: ({ row }) => {
        const v = row.original
        return (
          <div className="flex min-w-0 items-center gap-2">
            {canEdit ? (
              <Link
                href={`/event/${v.event.id}/volunteers/${v.id}`}
                className="truncate font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
              >
                {v.member.firstName} {v.member.lastName}
              </Link>
            ) : (
              <span className="truncate font-medium">
                {v.member.firstName} {v.member.lastName}
              </span>
            )}
            {v.servingInBoth && (
              <Badge variant="outline" className="shrink-0 text-xs font-normal">
                Serving in both
              </Badge>
            )}
          </div>
        )
      },
    },
    // Previously a grey subtitle under the name; a column of its own so it can
    // be copied, and switched off by anyone who doesn't need it.
    phoneColumn<ClusterVolunteerRow>((row) => row.member.phone),
    // The Event column only earns its place when the day has more than one.
    ...(showEventColumn
      ? [
          {
            id: "event",
            accessorFn: (row: ClusterVolunteerRow) => row.event.name,
            header: "Signed up under",
            meta: { label: "Signed up under", width: "name" },
            cell: ({ row }) => (
              <span className="text-sm text-muted-foreground">{row.original.event.name}</span>
            ),
          } satisfies ColumnDef<ClusterVolunteerRow>,
        ]
      : []),
    {
      id: "committee",
      accessorFn: (row) => row.committee.name,
      header: "Committee",
      meta: { label: "Committee", width: "text" },
      cell: ({ row }) => <span className="text-sm">{row.original.committee.name}</span>,
    },
    {
      id: "role",
      accessorFn: (row) => row.assignedRole?.name ?? row.preferredRole.name,
      header: "Role",
      meta: { label: "Role", width: "text" },
      cell: ({ row }) =>
        row.original.assignedRole?.name ?? (
          <span className="text-muted-foreground">
            {row.original.preferredRole.name} <span className="text-xs">(preferred)</span>
          </span>
        ),
    },
    {
      accessorKey: "status",
      header: "Status",
      meta: { label: "Status", width: "narrow" },
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status]}>{row.original.status}</Badge>
      ),
    },
    emailColumn<ClusterVolunteerRow>((row) => row.member.email, { optIn: true }),
    {
      accessorKey: "notes",
      header: "Notes",
      meta: { label: "Notes", width: "wide", optIn: true },
      cell: ({ row }) =>
        row.original.notes ?? <span className="text-muted-foreground">—</span>,
    },
  ]
}

export function ClusterVolunteersTable({
  rows,
  committees,
  events,
  canEdit,
  scope,
  formIsOpen,
}: {
  rows: ClusterVolunteerRow[]
  committees: { id: string; name: string; eventId: string }[]
  events: { id: string; name: string }[]
  canEdit: boolean
  /** Which list this is — the day's own sign-ups, or both standing rosters. */
  scope: "day" | "all"
  /** Whether the day's volunteer form is currently accepting sign-ups. */
  formIsOpen: boolean
}) {
  const showEventColumn = events.length > 1
  const columns = React.useMemo(
    () => buildColumns({ canEdit, showEventColumn }),
    [canEdit, showEventColumn],
  )

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm font-medium">
          {scope === "day" ? "No sign-ups for this day yet" : "No volunteers yet"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {scope === "day" ? (
            <>
              This list fills up as people sign up through the day&apos;s volunteer
              form.{" "}
              {formIsOpen
                ? "Share the link from Forms → Volunteer Sign-Up."
                : "Open it under Forms → Volunteer Sign-Up to start recruiting."}
            </>
          ) : (
            <>
              Nobody has volunteered on either of the day&apos;s events yet.
              Everyone confirmed across them can run any of its breakout tables.
            </>
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border">
      <DataTable
        tableKey="cluster.volunteers"
        rowLabel={{ one: "volunteer", many: "volunteers" }}
        columns={columns}
        data={rows}
      />
      {committees.length === 0 && (
        <p className="border-t p-4 text-sm text-muted-foreground">
          No committees are set up on the day&apos;s events yet.
        </p>
      )}
    </div>
  )
}
