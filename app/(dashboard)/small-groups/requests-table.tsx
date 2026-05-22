"use client"

import * as React from "react"
import Link from "next/link"
import { IconUsersGroup } from "@tabler/icons-react"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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
  leaderName: string
  leaderId: string
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
}: {
  request: RequestRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
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
              <Link
                href={`/members/${request.leaderId}`}
                className="text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
              >
                {request.leaderName}
              </Link>
              <p className="text-sm text-muted-foreground">
                {request.leaderPhone ?? "No phone on record"}
              </p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Requests table ─────────────────────────────────────────────────────────────

export function RequestsTable({ requests }: { requests: RequestRow[] }) {
  const [selected, setSelected] = React.useState<RequestRow | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  function openSheet(request: RequestRow) {
    setSelected(request)
    setSheetOpen(true)
  }

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
        {requests.map((r) => (
          <div
            key={r.id}
            className="cursor-pointer rounded-lg border p-4 hover:bg-muted/50 transition-colors"
            onClick={() => openSheet(r)}
          >
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
                {r.leaderName}
                {r.leaderPhone ? ` · ${r.leaderPhone}` : ""}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Request Type</TableHead>
              <TableHead>Target Group</TableHead>
              <TableHead>Leader</TableHead>
              <TableHead>Requested</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => openSheet(r)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.personName}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PERSON_BADGE[r.personType]}`}
                    >
                      {r.personType}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {r.isTransfer ? (
                    <span className="text-sm">
                      Transfer from{" "}
                      <span className="font-medium">{r.fromGroupName}</span>
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Join</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="font-medium">{r.targetGroupName}</span>
                </TableCell>
                <TableCell>
                  <p className="text-sm">{r.leaderName}</p>
                  {r.leaderPhone && (
                    <p className="text-xs text-muted-foreground">
                      {r.leaderPhone}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(r.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <RequestDetailSheet
        request={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  )
}
