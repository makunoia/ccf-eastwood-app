"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { IconCheck, IconDots, IconUsersGroup, IconX } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { DataTable } from "@/components/ui/data-table"
import { buildSelectionColumn } from "@/components/batch/selection-column"
import { emailColumn, phoneColumn } from "@/lib/tables/columns/contact"
import { useBatchSelection } from "@/components/batch/batch-selection-provider"
import { RequestDecisionDialog } from "./request-decision-dialog"
import { type RequestDecision } from "./actions"

export type RequestRow = {
  id: string
  createdAt: Date
  notes: string | null
  personName: string
  personType: "Guest" | "Member"
  personEmail: string | null
  personPhone: string | null
  personId: string
  isTransfer: boolean
  fromGroupId: string | null
  fromGroupName: string | null
  targetGroupId: string
  targetGroupName: string
  leaderName: string | null
  leaderId: string | null
  leaderPhone: string | null
}

const PERSON_BADGE: Record<RequestRow["personType"], string> = {
  Member: "bg-blue-100 text-blue-700",
  Guest: "bg-purple-100 text-purple-700",
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ─── Detail sheet ───────────────────────────────────────────────────────────────

function RequestDetailSheet({
  request,
  open,
  onOpenChange,
  canWrite,
  onDecide,
}: {
  request: RequestRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  canWrite: boolean
  onDecide: (request: RequestRow, decision: RequestDecision) => void
}) {
  if (!request) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{request.personName}</SheetTitle>
          <SheetDescription>
            {request.isTransfer ? "Transfer request" : "Join request"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 px-4 pb-6">
          {/* Person */}
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Person
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Type</p>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PERSON_BADGE[request.personType]}`}
                >
                  {request.personType}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Requested</p>
                <p className="text-sm">{formatDate(request.createdAt)}</p>
              </div>
            </div>
            {request.personPhone && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="text-sm">{request.personPhone}</p>
              </div>
            )}
            {request.personEmail && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm">{request.personEmail}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Request details */}
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Request
            </p>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Type</p>
              <p className="text-sm">
                {request.isTransfer
                  ? `Transfer from ${request.fromGroupName}`
                  : "New join"}
              </p>
            </div>
            {request.notes && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="text-sm">{request.notes}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Target group */}
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Target Group
            </p>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Group</p>
              <Link
                href={`/small-groups/${request.targetGroupId}`}
                className="text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
              >
                {request.targetGroupName}
              </Link>
            </div>
          </div>

          <Separator />

          {/* Leader follow-up card */}
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Leader to Follow Up
            </p>
            <div className="rounded-lg border p-3 space-y-1">
              {request.leaderId && request.leaderName ? (
                <>
                  <Link
                    href={`/members/${request.leaderId}`}
                    className="text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                  >
                    {request.leaderName}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {request.leaderPhone ?? "No phone on record"}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No leader assigned</p>
              )}
            </div>
            {canWrite && (
              <p className="text-xs text-muted-foreground">
                Waiting on them to answer their confirmation link. You can settle it here
                instead — the decision is recorded on their behalf.
              </p>
            )}
          </div>
        </div>

        {canWrite && (
          <SheetFooter className="flex-row gap-2 border-t">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onDecide(request, "deny")}
            >
              <IconX className="size-4" />
              Deny
            </Button>
            <Button className="flex-1" onClick={() => onDecide(request, "approve")}>
              <IconCheck className="size-4" />
              Approve
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─── Row actions ────────────────────────────────────────────────────────────────

/**
 * The per-row decision menu, matching the `RowActions` every other list table
 * uses. A pair of always-visible Approve/Deny buttons put two competing calls to
 * action on every row of a queue that is read top-to-bottom — the menu keeps the
 * row scannable and still puts both one click away.
 */
function RequestRowActions({
  request,
  onDecide,
}: {
  request: RequestRow
  onDecide: (request: RequestRow, decision: RequestDecision) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          {/* Named per row — a table of "Open menu" tells a screen reader nothing. */}
          <span className="sr-only">Decide {request.personName}&apos;s request</span>
          <IconDots className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onDecide(request, "approve")}>
          <IconCheck className="mr-2 size-4" />
          Approve
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onDecide(request, "deny")}
          className="text-destructive focus:text-destructive"
        >
          <IconX className="mr-2 size-4" />
          Deny
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Requests table ─────────────────────────────────────────────────────────────

function buildColumns({
  selectable,
  canWrite,
  onDecide,
}: {
  selectable: boolean
  canWrite: boolean
  onDecide: (request: RequestRow, decision: RequestDecision) => void
}): ColumnDef<RequestRow>[] {
  return [
    ...(selectable ? [buildSelectionColumn<RequestRow>()] : []),
    {
      id: "person",
      accessorFn: (row) => row.personName,
      header: "Person",
      meta: { label: "Person", width: "name", locked: true, noTruncate: true },
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{row.original.personName}</span>
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${PERSON_BADGE[row.original.personType]}`}
          >
            {row.original.personType}
          </span>
        </div>
      ),
    },
    {
      id: "requestType",
      accessorFn: (row) => (row.isTransfer ? `Transfer from ${row.fromGroupName}` : "Join"),
      header: "Request Type",
      meta: { label: "Request Type", width: "text" },
      cell: ({ row }) =>
        row.original.isTransfer ? (
          <span className="text-sm">
            Transfer from <span className="font-medium">{row.original.fromGroupName}</span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Join</span>
        ),
    },
    {
      accessorKey: "targetGroupName",
      header: "Target Group",
      meta: { label: "Target Group", width: "name" },
      cell: ({ row }) => <span className="font-medium">{row.original.targetGroupName}</span>,
    },
    {
      id: "leader",
      accessorFn: (row) => row.leaderName ?? "",
      header: "Leader",
      meta: { label: "Leader", width: "name" },
      cell: ({ row }) =>
        row.original.leaderName ?? <span className="text-muted-foreground">No leader</span>,
    },
    // Was a grey subtitle under the leader's name; its own copyable column now,
    // which is what an admin chasing a pending request actually wants.
    phoneColumn<RequestRow>((row) => row.leaderPhone, {
      id: "leaderPhone",
      header: "Leader Mobile",
    }),
    {
      accessorKey: "createdAt",
      header: "Requested",
      meta: { label: "Requested", width: "date" },
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.createdAt)}</span>
      ),
    },
    phoneColumn<RequestRow>((row) => row.personPhone, {
      id: "personPhone",
      header: "Person Mobile",
      optIn: true,
    }),
    emailColumn<RequestRow>((row) => row.personEmail, {
      id: "personEmail",
      header: "Person Email",
      optIn: true,
    }),
    ...(canWrite
      ? [
          {
            id: "actions",
            meta: { width: "actions", locked: true, stopRowClick: true },
            cell: ({ row }) => <RequestRowActions request={row.original} onDecide={onDecide} />,
          } satisfies ColumnDef<RequestRow>,
        ]
      : []),
  ]
}

export function RequestsTable({
  requests,
  canWrite = false,
}: {
  requests: RequestRow[]
  canWrite?: boolean
}) {
  const selection = useBatchSelection()
  const [selected, setSelected] = React.useState<RequestRow | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)
  /** The single row being approved/denied from its own buttons. */
  const [deciding, setDeciding] = React.useState<{
    request: RequestRow
    decision: RequestDecision
  } | null>(null)

  const selectable = canWrite && (selection?.enabled ?? false)
  // Mobile has no room for a checkbox column, so tapping a card selects only once
  // the admin has explicitly entered select mode from the header.
  const cardSelecting = selectable && (selection?.selectMode ?? false)

  function openSheet(request: RequestRow) {
    setSelected(request)
    setSheetOpen(true)
  }

  const decide = React.useCallback((request: RequestRow, decision: RequestDecision) => {
    setSheetOpen(false)
    setDeciding({ request, decision })
  }, [])

  const columns = React.useMemo(
    () => buildColumns({ selectable, canWrite, onDecide: decide }),
    [selectable, canWrite, decide],
  )

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <IconUsersGroup className="size-8" />
        <p className="text-sm">No pending requests</p>
      </div>
    )
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {requests.map((r) => {
          const checked = selection?.isSelected(r.id) ?? false
          return (
            <div
              key={r.id}
              className="cursor-pointer rounded-lg border p-4 hover:bg-muted/50 transition-colors data-[selected=true]:border-primary"
              data-selected={checked}
              onClick={() => {
                if (cardSelecting) {
                  selection?.toggle(r.id)
                  return
                }
                openSheet(r)
              }}
            >
              <div className="flex items-start gap-3">
                {cardSelecting && (
                  <Checkbox
                    checked={checked}
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={() => selection?.toggle(r.id)}
                    aria-label={`Select ${r.personName}'s request`}
                    className="mt-0.5"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{r.personName}</p>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${PERSON_BADGE[r.personType]}`}
                    >
                      {r.personType}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                    <span className="text-muted-foreground">Request</span>
                    <span>
                      {r.isTransfer ? `Transfer from ${r.fromGroupName}` : "Join"}
                    </span>
                    <span className="text-muted-foreground">Group</span>
                    <span>{r.targetGroupName}</span>
                    <span className="text-muted-foreground">Leader</span>
                    <span>
                      {r.leaderName ?? "No leader"}
                      {r.leaderPhone ? ` · ${r.leaderPhone}` : ""}
                    </span>
                  </div>
                  {canWrite && !cardSelecting && (
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          decide(r, "deny")
                        }}
                      >
                        <IconX className="size-4" />
                        Deny
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          decide(r, "approve")
                        }}
                      >
                        <IconCheck className="size-4" />
                        Approve
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:flex md:flex-1 md:flex-col">
        <DataTable
          tableKey="small-groups.requests"
          rowLabel={{ one: "request", many: "requests" }}
          columns={columns}
          data={requests}
          onRowClick={openSheet}
        />
      </div>

      <RequestDetailSheet
        request={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        canWrite={canWrite}
        onDecide={decide}
      />

      <RequestDecisionDialog
        open={deciding !== null}
        onOpenChange={(open) => {
          if (!open) setDeciding(null)
        }}
        ids={deciding ? [deciding.request.id] : []}
        decision={deciding?.decision ?? "approve"}
        subject={deciding?.request.personName ?? null}
      />
    </>
  )
}
