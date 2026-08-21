"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import Link from "next/link"

import { IconDots, IconPencil, IconUserMinus } from "@tabler/icons-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { removeClusterVolunteerFromDay } from "@/app/(dashboard)/events/cluster-actions"
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
 * Per-row actions, and there are only two because the day owns only one fact
 * about a volunteer: whether they are on it.
 *
 * **Open** goes to the volunteer's own detail page in their ministry's event
 * workspace, where committee, role and status are edited. That is the same
 * destination the name links to; it is repeated here because a menu whose every
 * item is destructive is a menu people learn not to open.
 *
 * **Remove from this day** clears the day's stamp and leaves the ministry's
 * roster entry standing — see `removeClusterVolunteerFromDay`. It is offered only
 * on the day's list: on "All rosters" most rows were never stamped, so the action
 * would be a no-op on the majority of the rows it appeared beside. Deleting the
 * volunteer outright is deliberately not offered here — that is the ministry's
 * decision, taken on the ministry's screen.
 */
function RowActions({
  row,
  clusterId,
}: {
  row: ClusterVolunteerRow
  clusterId: string
}) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)
  const name = `${row.member.firstName} ${row.member.lastName}`

  async function handleRemove() {
    setRemoving(true)
    const result = await removeClusterVolunteerFromDay(clusterId, row.id)
    setRemoving(false)
    if (result.success) {
      toast.success(`${name} removed from this day`)
      setConfirmOpen(false)
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <span className="sr-only">Open menu for {name}</span>
            <IconDots className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => router.push(`/event/${row.event.id}/volunteers/${row.id}`)}
          >
            <IconPencil className="mr-2 size-4" />
            Open volunteer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
            <IconUserMinus className="mr-2 size-4" />
            Remove from this day
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {name} from this day?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll come off this day&apos;s serving team. Their {row.event.name}{" "}
              volunteer record stays as it is — committee, role and status included.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleRemove()
              }}
              disabled={removing}
            >
              {removing ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
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
  clusterId,
  canEdit,
  showEventColumn,
  showRowActions,
}: {
  clusterId: string
  canEdit: boolean
  showEventColumn: boolean
  showRowActions: boolean
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
    // `actions`, not `micro`: a 32px icon trigger inside micro's 44px overflows
    // its own cell and loses the right edge of its hit area.
    ...(showRowActions
      ? [
          {
            id: "actions",
            meta: { width: "actions", locked: true, stopRowClick: true },
            cell: ({ row }) => <RowActions row={row.original} clusterId={clusterId} />,
          } satisfies ColumnDef<ClusterVolunteerRow>,
        ]
      : []),
  ]
}

export function ClusterVolunteersTable({
  clusterId,
  rows,
  committees,
  events,
  canEdit,
  scope,
  formIsOpen,
  filtered,
}: {
  clusterId: string
  rows: ClusterVolunteerRow[]
  committees: { id: string; name: string; eventId: string }[]
  events: { id: string; name: string }[]
  canEdit: boolean
  /** Which list this is — the day's own sign-ups, or both standing rosters. */
  scope: "day" | "all"
  /** Whether the day's volunteer form is currently accepting sign-ups. */
  formIsOpen: boolean
  /** Whether a search or filter is narrowing the list right now. */
  filtered: boolean
}) {
  const showEventColumn = events.length > 1
  // Only the day's own list can be taken off the day — see `RowActions`.
  const showRowActions = canEdit && scope === "day"
  const columns = React.useMemo(
    () => buildColumns({ clusterId, canEdit, showEventColumn, showRowActions }),
    [clusterId, canEdit, showEventColumn, showRowActions],
  )

  // "Nobody has signed up" and "nobody matches what you typed" are different
  // facts, and telling an admin the first when the second is true reads as the
  // day having lost its roster.
  if (rows.length === 0 && filtered) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm font-medium">No volunteers match these filters</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Try clearing the search or filters above.
        </p>
      </div>
    )
  }

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
