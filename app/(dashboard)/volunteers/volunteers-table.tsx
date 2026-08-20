"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { IconChevronDown, IconChevronRight, IconHeart } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DataTable } from "@/components/ui/data-table"
import { RowActions, type MemberVolunteerRow, type VolunteerRecord } from "./columns"

const STATUS_VARIANT = {
  Pending: "secondary",
  Confirmed: "default",
  Rejected: "destructive",
} as const

function SubTable({
  records,
  memberName,
}: {
  records: VolunteerRecord[]
  memberName: string
}) {
  // No <tr>/<td> wrapper: DataTable's `renderSubRow` already places this inside
  // a full-width cell spanning the visible columns.
  return (
    <div className="border-b bg-muted/30">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 pl-12 pr-4 text-left font-medium text-muted-foreground">
              Event
            </th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              Committee
            </th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              Preferred Role
            </th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              Assigned Role
            </th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">
              Status
            </th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="py-2 pl-12 pr-4">
                <Link
                  href={`/event/${r.eventId}/registrants`}
                  className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                >
                  {r.eventName}
                </Link>
              </td>
              <td className="px-4 py-2">{r.committee}</td>
              <td className="px-4 py-2">{r.preferredRole}</td>
              <td className="px-4 py-2">
                {r.assignedRole ?? (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-2">
                <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
              </td>
              <td className="px-4 py-2">
                <RowActions volunteerId={r.id} memberName={memberName} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MemberCard({ member }: { member: MemberVolunteerRow }) {
  const [open, setOpen] = React.useState(false)

  return (
    <Card className="py-0">
      <CardContent className="p-4">
        <button
          className="flex w-full items-start justify-between gap-2 text-left"
          onClick={() => setOpen(!open)}
        >
          <div>
            <p className="font-medium">{member.memberName}</p>
            <p className="text-xs text-muted-foreground">
              {member.totalEvents} event{member.totalEvents !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[member.aggregatedStatus]}>
              {member.aggregatedStatus}
            </Badge>
            {open ? (
              <IconChevronDown className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
            )}
          </div>
        </button>

        {open && (
          <div className="mt-3 space-y-2 border-t pt-3">
            {member.records.map((r) => (
              <div key={r.id} className="rounded border p-3 text-sm space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/event/${r.eventId}/registrants`}
                    className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                  >
                    {r.eventName}
                  </Link>
                  <div className="flex items-center gap-1">
                    <Badge
                      variant={STATUS_VARIANT[r.status]}
                      className="text-xs"
                    >
                      {r.status}
                    </Badge>
                    <RowActions volunteerId={r.id} memberName={member.memberName} />
                  </div>
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Committee</span>
                  <span>{r.committee}</span>
                  <span className="text-muted-foreground">Preferred Role</span>
                  <span>{r.preferredRole}</span>
                  <span className="text-muted-foreground">Assigned Role</span>
                  <span>{r.assignedRole ?? <span className="text-muted-foreground">—</span>}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function buildColumns(expanded: Set<string>): ColumnDef<MemberVolunteerRow>[] {
  return [
    {
      id: "member",
      accessorFn: (row) => row.memberName,
      header: "Member",
      meta: { label: "Member", width: "name", locked: true, noTruncate: true },
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2 font-medium">
          <Button variant="ghost" size="icon" className="size-6 shrink-0" tabIndex={-1}>
            {expanded.has(row.original.memberId) ? (
              <IconChevronDown className="size-3" />
            ) : (
              <IconChevronRight className="size-3" />
            )}
            <span className="sr-only">
              {expanded.has(row.original.memberId) ? "Collapse" : "Expand"}{" "}
              {row.original.memberName}
            </span>
          </Button>
          <Link
            href={`/members/${row.original.memberId}`}
            className="truncate font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {row.original.memberName}
          </Link>
        </div>
      ),
    },
    {
      accessorKey: "totalEvents",
      header: "Events Volunteered",
      meta: { label: "Events Volunteered", width: "narrow", align: "right" },
      cell: ({ row }) => <span className="tabular-nums">{row.original.totalEvents}</span>,
    },
    {
      accessorKey: "aggregatedStatus",
      header: "Status",
      meta: { label: "Status", width: "status" },
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.aggregatedStatus]}>
          {row.original.aggregatedStatus}
        </Badge>
      ),
    },
  ]
}

export function VolunteersTable({ members }: { members: MemberVolunteerRow[] }) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())

  const toggle = React.useCallback((memberId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }, [])

  // Rebuilt when the expanded set changes so the chevron in the Member cell
  // points the right way.
  const columns = React.useMemo(() => buildColumns(expanded), [expanded])

  const empty = (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
      <IconHeart className="size-8" />
      <p className="text-sm">No volunteers yet</p>
    </div>
  )

  if (members.length === 0) return empty

  return (
    <>
      {/* Mobile */}
      <div className="flex flex-col gap-2 md:hidden">
        {members.map((m) => (
          <MemberCard key={m.memberId} member={m} />
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden md:flex md:flex-1 md:flex-col">
        <DataTable
          tableKey="volunteers"
          rowLabel={{ one: "volunteer", many: "volunteers" }}
          columns={columns}
          data={members}
          onRowClick={(m) => toggle(m.memberId)}
          renderSubRow={(m) =>
            expanded.has(m.memberId) ? (
              <SubTable records={m.records} memberName={m.memberName} />
            ) : null
          }
        />
      </div>
    </>
  )
}
