"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable } from "@/components/ui/data-table"
import { FilterBar, FilterField } from "@/components/filter-bar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { callAction, SUBMIT_NETWORK_ERROR } from "@/lib/forms/call-action"
import { deleteCatchMechInterest, dismissCatchMechInterest } from "./interest-actions"

export type InterestRow = {
  id: string
  createdAt: Date | string
  personName: string
  personType: "Member" | "Guest"
  personId: string
  status: "Pending" | "Confirmed" | "Rejected"
  groupId: string | null
  groupName: string | null
}

export function interestRequestState(row: InterestRow): string {
  if (row.status === "Confirmed") return "Placed"
  if (row.status === "Rejected") return row.groupId ? "Declined" : "Dismissed"
  return row.groupId ? "Awaiting leader confirmation" : "Awaiting placement"
}

const REQUEST_STATES = [
  "Awaiting placement", "Awaiting leader confirmation", "Placed", "Declined", "Dismissed",
]

type Props = {
  eventId: string
  rows: InterestRow[]
  canManage: boolean
  canViewMembers?: boolean
  canViewGuests?: boolean
}

export function InterestTracker({ eventId, rows, canManage }: Props) {
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState("all")
  const [confirmation, setConfirmation] = React.useState<{
    row: InterestRow
    action: "dismiss" | "delete"
  } | null>(null)
  const [saving, setSaving] = React.useState(false)
  const filtered = rows.filter((row) =>
    row.personName.toLowerCase().includes(query.toLowerCase()) &&
    (status === "all" || interestRequestState(row) === status)
  )

  async function resolveConfirmation() {
    if (!confirmation || saving) return
    setSaving(true)
    const result = await callAction(
      () => confirmation.action === "delete"
        ? deleteCatchMechInterest(eventId, confirmation.row.id)
        : dismissCatchMechInterest(eventId, confirmation.row.id),
      "resolveCatchMechInterest"
    )
    setSaving(false)
    if (!result || !result.success) {
      toast.error(result ? result.error : SUBMIT_NETWORK_ERROR)
      return
    }
    toast.success(confirmation.action === "delete" ? "DGroup interest deleted" : "DGroup interest dismissed")
    setConfirmation(null)
    router.refresh()
  }

  const columns: ColumnDef<InterestRow>[] = [
    {
      accessorKey: "personName",
      header: "Name",
      meta: { label: "Name", width: "name", locked: true },
      cell: ({ row }) => (
        <Link
          href={`/event/${eventId}/catch-mech/interest/${row.original.id}`}
          className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
        >
          {row.original.personName}
        </Link>
      ),
    },
    {
      accessorKey: "personType",
      header: "Type",
      meta: { label: "Type", width: "narrow" },
    },
    {
      id: "status",
      accessorFn: interestRequestState,
      header: "Status",
      meta: { label: "Status", width: "text" },
    },
    {
      accessorKey: "groupName",
      header: "DGroup",
      meta: { label: "DGroup", width: "name" },
      cell: ({ row }) => row.original.groupName ?? "—",
    },
    {
      id: "createdAt",
      accessorFn: (row) => new Date(row.createdAt).getTime(),
      header: "Requested",
      meta: { label: "Requested", width: "date" },
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString("en-PH", {
        month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila",
      }),
    },
    ...(canManage ? [{
      id: "actions",
      meta: { width: "actions", locked: true },
      cell: ({ row }) => {
        const request = row.original
        const canAct = request.status === "Pending" && !request.groupId
        const canDelete = !request.groupId && (request.status === "Pending" || request.status === "Rejected")
        if (!canAct && !canDelete) return null
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Actions for ${request.personName}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canAct && (
                <DropdownMenuItem onSelect={() => setConfirmation({ row: request, action: "dismiss" })}>
                  Dismiss
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmation({ row: request, action: "delete" })}>
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    } satisfies ColumnDef<InterestRow>] : []),
  ]

  return (
    <section className="space-y-4" aria-label="DGroup interest requests">
      <div className="flex items-center gap-3">
        <Input
          aria-label="Search DGroup interest"
          placeholder="Search by name"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-sm"
        />
        <FilterBar activeCount={status === "all" ? 0 : 1} onClear={() => setStatus("all")}>
          <FilterField label="Status">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {REQUEST_STATES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterField>
        </FilterBar>
      </div>
      <p className="text-sm text-muted-foreground">
        {rows.filter((row) => row.status === "Pending" && !row.groupId).length} awaiting placement
      </p>
      <DataTable
        tableKey="event.catch-mech.interest"
        rowLabel={{ one: "request", many: "requests" }}
        columns={columns}
        data={filtered}
        emptyState={<p>{rows.length ? "No requests match your search or filters." : "No DGroup interest requests from this event yet."}</p>}
      />
      <AlertDialog open={!!confirmation} onOpenChange={(open) => { if (!open && !saving) setConfirmation(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation?.action === "delete" ? "Delete" : "Dismiss"} {confirmation?.row.personName}&apos;s DGroup interest?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.action === "delete"
                ? "This permanently removes the interest request. Their guest or member profile is kept. This cannot be undone."
                : "The request will remain in this tracker as dismissed. Their matching profile is kept."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Keep request</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void resolveConfirmation() }}>
              {saving ? "Saving…" : confirmation?.action === "delete" ? "Delete request" : "Dismiss request"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
