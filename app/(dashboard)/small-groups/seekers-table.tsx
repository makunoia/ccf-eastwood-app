"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { IconUserSearch } from "@tabler/icons-react"
import { toast } from "sonner"
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
import { DataTable } from "@/components/ui/data-table"
import { emailColumn, phoneColumn } from "@/lib/tables/columns/contact"
import { dismissSeekerRequest } from "./actions"

/**
 * People who asked to join a DGroup but have no group picked yet (CCF-101).
 *
 * Separate from the Requests table because the admin's job is the opposite one:
 * a request names a group and waits on its leader to confirm, whereas a seeker
 * names a person and waits on someone to *choose* a group. So the row leads to
 * the person's profile, where the matching engine already lives, rather than to
 * a group.
 */

export type SeekerRow = {
  id: string
  createdAt: Date
  personName: string
  personType: "Guest" | "Member"
  personId: string
  personEmail: string | null
  personPhone: string | null
  /** Which event's form the ask came from — null if the event was since deleted. */
  sourceEventId: string | null
  sourceEventName: string | null
  /** Set when a Member who is already in a group asks — most likely a transfer. */
  currentGroupId: string | null
  currentGroupName: string | null
}

const PERSON_BADGE: Record<SeekerRow["personType"], string> = {
  Member: "bg-blue-100 text-blue-700",
  Guest: "bg-purple-100 text-purple-700",
}

const LINK_CLASS =
  "font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"

function formatDate(date: Date) {
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
}

function profileHref(row: SeekerRow) {
  return row.personType === "Member" ? `/members/${row.personId}` : `/guests/${row.personId}`
}

function buildColumns({
  canWrite,
  onDismiss,
}: {
  canWrite: boolean
  onDismiss: (row: SeekerRow) => void
}): ColumnDef<SeekerRow>[] {
  return [
    {
      id: "person",
      accessorFn: (row) => row.personName,
      header: "Person",
      meta: { label: "Person", width: "name", locked: true, noTruncate: true },
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <Link href={profileHref(row.original)} className={`truncate ${LINK_CLASS}`}>
            {row.original.personName}
          </Link>
          <span
            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${PERSON_BADGE[row.original.personType]}`}
          >
            {row.original.personType}
          </span>
        </div>
      ),
    },
    // Was one "Contact" cell showing `phone ?? email`, which silently hid
    // whichever one it didn't pick. Two columns, either of which can be
    // switched off, says the same thing without losing the other.
    phoneColumn<SeekerRow>((row) => row.personPhone),
    emailColumn<SeekerRow>((row) => row.personEmail, { optIn: true }),
    {
      id: "sourceEvent",
      accessorFn: (row) => row.sourceEventName ?? "",
      header: "Asked at",
      meta: { label: "Asked at", width: "name" },
      cell: ({ row }) =>
        row.original.sourceEventId && row.original.sourceEventName ? (
          <Link href={`/event/${row.original.sourceEventId}/dashboard`} className={LINK_CLASS}>
            {row.original.sourceEventName}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "currentGroup",
      accessorFn: (row) => row.currentGroupName ?? "",
      header: "Current DGroup",
      meta: { label: "Current DGroup", width: "name" },
      cell: ({ row }) =>
        row.original.currentGroupId && row.original.currentGroupName ? (
          <Link href={`/small-groups/${row.original.currentGroupId}`} className={LINK_CLASS}>
            {row.original.currentGroupName}
          </Link>
        ) : (
          <span className="text-muted-foreground">None</span>
        ),
    },
    {
      accessorKey: "createdAt",
      header: "Asked",
      meta: { label: "Asked", width: "date" },
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>
      ),
    },
    ...(canWrite
      ? [
          {
            id: "actions",
            // Wider than the usual icon-only actions column: this one holds a
            // text button.
            meta: { width: "narrow", locked: true },
            cell: ({ row }) => (
              <Button variant="ghost" size="sm" onClick={() => onDismiss(row.original)}>
                Dismiss
              </Button>
            ),
          } satisfies ColumnDef<SeekerRow>,
        ]
      : []),
  ]
}

export function SeekersTable({
  seekers,
  canWrite,
}: {
  seekers: SeekerRow[]
  canWrite: boolean
}) {
  const [dismissing, setDismissing] = React.useState<SeekerRow | null>(null)
  const columns = React.useMemo(
    () => buildColumns({ canWrite, onDismiss: setDismissing }),
    [canWrite],
  )
  const [pending, setPending] = React.useState(false)

  async function handleDismiss() {
    if (!dismissing) return
    setPending(true)
    const result = await dismissSeekerRequest(dismissing.id)
    setPending(false)
    setDismissing(null)
    if (result.success) {
      toast.success(`Dismissed ${dismissing.personName}'s request`)
    } else {
      toast.error(result.error)
    }
  }

  if (seekers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <IconUserSearch className="size-8" />
        <p className="text-sm">Nobody is waiting to be matched</p>
        <p className="max-w-sm text-center text-xs">
          People who tick &ldquo;I want to join a DGroup&rdquo; when they register or check in
          show up here.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {seekers.map((s) => (
          <div key={s.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <Link href={profileHref(s)} className={LINK_CLASS}>
                {s.personName}
              </Link>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${PERSON_BADGE[s.personType]}`}
              >
                {s.personType}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Asked at</span>
              <span>{s.sourceEventName ?? "—"}</span>
              <span className="text-muted-foreground">Contact</span>
              <span>{s.personPhone ?? s.personEmail ?? "—"}</span>
              {s.currentGroupName && (
                <>
                  <span className="text-muted-foreground">Current</span>
                  <span>{s.currentGroupName}</span>
                </>
              )}
              <span className="text-muted-foreground">Asked</span>
              <span>{formatDate(s.createdAt)}</span>
            </div>
            {canWrite && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => setDismissing(s)}
              >
                Dismiss
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:flex md:flex-1 md:flex-col">
        <DataTable tableKey="small-groups.seekers" rowLabel={{ one: "seeker", many: "seekers" }} columns={columns} data={seekers} />
      </div>

      <AlertDialog
        open={dismissing !== null}
        onOpenChange={(open) => {
          if (!open) setDismissing(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss {dismissing?.personName}&apos;s request?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll come off this list. Their matching profile is kept, so you can still
              place them from their profile page later — and they&apos;ll reappear here if they
              ask again at another event.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDismiss} disabled={pending}>
              {pending ? "Dismissing…" : "Dismiss"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
