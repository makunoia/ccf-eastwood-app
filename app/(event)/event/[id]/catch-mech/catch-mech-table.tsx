"use client"

import * as React from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
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

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MemberEntry = {
  name: string
  status: "Confirmed" | "Rejected" | "Pending"
}

export type GroupRow = {
  id: string
  name: string
  faciName: string | null
  faciMemberId: string | null
  isTimothy: boolean
  ledGroupName: string | null
  totalMembers: number
  confirmedCount: number
  rejectedCount: number
  pendingCount: number
  members: MemberEntry[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_BADGE_CLASS: Record<MemberEntry["status"], string> = {
  Confirmed: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
  Pending: "bg-amber-100 text-amber-700",
}

const FACI_BADGE_CLASS = {
  Timothy: "bg-amber-100 text-amber-700",
  Leader: "bg-green-100 text-green-700",
}

// ─── Group detail sheet ─────────────────────────────────────────────────────────

function GroupDetailSheet({
  group,
  open,
  onOpenChange,
}: {
  group: GroupRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!group) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{group.name}</SheetTitle>
          <SheetDescription>
            {group.faciName ? `Facilitated by ${group.faciName}` : "No facilitator assigned"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5 px-4 pb-6">
          {/* Mini stats */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Confirmed</p>
              <p className="text-xl font-bold text-green-600">{group.confirmedCount}</p>
            </div>
            <div className="rounded-lg border px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Rejected</p>
              <p className="text-xl font-bold text-red-600">{group.rejectedCount}</p>
            </div>
            <div className="rounded-lg border px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-xl font-bold text-amber-600">{group.pendingCount}</p>
            </div>
          </div>

          <Separator />

          {/* Member list */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Members ({group.totalMembers})
            </p>
            {group.members.length > 0 ? (
              <div className="divide-y rounded-lg border overflow-hidden">
                {group.members.map((m, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-sm">{m.name}</span>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${STATUS_BADGE_CLASS[m.status]}`}
                    >
                      {m.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">No members assigned yet.</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Facilitator detail sheet ───────────────────────────────────────────────────

function FacilitatorDetailSheet({
  group,
  open,
  onOpenChange,
}: {
  group: GroupRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!group || !group.faciName) return null

  const roleLabel = group.isTimothy ? "Timothy" : "Leader"
  const badgeClass = group.isTimothy ? FACI_BADGE_CLASS.Timothy : FACI_BADGE_CLASS.Leader

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{group.faciName}</SheetTitle>
          <SheetDescription>Facilitating {group.name}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5 px-4 pb-6">
          {/* Role */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Role</p>
            <Badge variant="secondary" className={`text-xs ${badgeClass}`}>
              {roleLabel}
            </Badge>
          </div>

          {/* Led small group */}
          {group.ledGroupName && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Leads</p>
              <p className="text-sm">{group.ledGroupName}</p>
            </div>
          )}

          <Separator />

          {/* Member profile link */}
          {group.faciMemberId && (
            <Link
              href={`/members/${group.faciMemberId}`}
              className="text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
            >
              View member profile →
            </Link>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Main table ─────────────────────────────────────────────────────────────────

export function CatchMechTable({ groupRows }: { groupRows: GroupRow[] }) {
  const [groupSheet, setGroupSheet] = React.useState<GroupRow | null>(null)
  const [faciSheet, setFaciSheet] = React.useState<GroupRow | null>(null)

  return (
    <>
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group</TableHead>
              <TableHead>Facilitator</TableHead>
              <TableHead className="text-right">Members</TableHead>
              <TableHead className="text-right">Confirmed</TableHead>
              <TableHead className="text-right">Rejected</TableHead>
              <TableHead className="text-right">Pending</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                  No breakout groups yet.
                </TableCell>
              </TableRow>
            ) : (
              groupRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <button
                      onClick={() => setGroupSheet(row)}
                      className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors text-left"
                    >
                      {row.name}
                    </button>
                  </TableCell>

                  <TableCell>
                    {row.faciName ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setFaciSheet(row)}
                          className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors text-left"
                        >
                          {row.faciName}
                        </button>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${row.isTimothy ? FACI_BADGE_CLASS.Timothy : FACI_BADGE_CLASS.Leader}`}
                        >
                          {row.isTimothy ? "Timothy" : "Leader"}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell className="text-right">{row.totalMembers}</TableCell>
                  <TableCell className="text-right font-medium text-green-600">{row.confirmedCount}</TableCell>
                  <TableCell className="text-right font-medium text-red-600">{row.rejectedCount}</TableCell>
                  <TableCell className="text-right text-amber-600">{row.pendingCount}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <GroupDetailSheet
        group={groupSheet}
        open={!!groupSheet}
        onOpenChange={(open) => { if (!open) setGroupSheet(null) }}
      />
      <FacilitatorDetailSheet
        group={faciSheet}
        open={!!faciSheet}
        onOpenChange={(open) => { if (!open) setFaciSheet(null) }}
      />
    </>
  )
}
