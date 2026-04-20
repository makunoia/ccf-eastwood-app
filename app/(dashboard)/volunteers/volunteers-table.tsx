"use client"

import * as React from "react"
import Link from "next/link"
import { IconChevronDown, IconChevronRight, IconHeart } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
  return (
    <tr>
      <td colSpan={4} className="p-0">
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
      </td>
    </tr>
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

export function VolunteersTable({ members }: { members: MemberVolunteerRow[] }) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())

  function toggle(memberId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }

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
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Member</th>
              <th className="px-4 py-3 text-left font-medium">Events Volunteered</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <React.Fragment key={m.memberId}>
                <tr
                  className="cursor-pointer border-b hover:bg-muted/50 transition-colors"
                  onClick={() => toggle(m.memberId)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        tabIndex={-1}
                      >
                        {expanded.has(m.memberId) ? (
                          <IconChevronDown className="size-3" />
                        ) : (
                          <IconChevronRight className="size-3" />
                        )}
                      </Button>
                      <Link
                        href={`/members/${m.memberId}`}
                        className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {m.memberName}
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-3">{m.totalEvents}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[m.aggregatedStatus]}>
                      {m.aggregatedStatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()} />
                </tr>
                {expanded.has(m.memberId) && (
                  <SubTable records={m.records} memberName={m.memberName} />
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
