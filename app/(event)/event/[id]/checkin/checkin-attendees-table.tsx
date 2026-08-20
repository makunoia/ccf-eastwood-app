"use client"

import { useMemo, useState } from "react"
import { type ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { CheckinAttendeeRow } from "@/lib/checkin-stats"

type TypeFilter = "all" | "member" | "guest" | "volunteer"

const linkClassName =
  "font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"

function attendeeHref(eventId: string, a: CheckinAttendeeRow): string {
  return a.kind === "volunteer"
    ? `/event/${eventId}/volunteers/${a.subjectId}`
    : `/event/${eventId}/registrants/${a.subjectId}`
}

function TypeBadge({ a }: { a: CheckinAttendeeRow }) {
  if (a.isVolunteer) {
    return (
      <Badge variant="outline" className="border-amber-400 text-amber-600">
        Volunteer
      </Badge>
    )
  }
  if (a.isMember) return <Badge variant="secondary">Member</Badge>
  return <Badge variant="outline">Guest</Badge>
}

function buildColumns(eventId: string): ColumnDef<CheckinAttendeeRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
      meta: { label: "Name", width: "name", locked: true },
      cell: ({ row }) => (
        <Link href={attendeeHref(eventId, row.original)} className={linkClassName}>
          {row.original.name ?? (
            <span className="text-muted-foreground italic">No name</span>
          )}
        </Link>
      ),
    },
    {
      id: "status",
      accessorFn: (row) => (row.isReturner ? "Returning" : "New"),
      header: "Status",
      meta: { label: "Status", width: "narrow" },
      cell: ({ row }) =>
        row.original.isReturner ? <Badge variant="secondary">Returning</Badge> : <Badge>New</Badge>,
    },
    {
      id: "type",
      accessorFn: (row) => (row.isVolunteer ? "Volunteer" : row.isMember ? "Member" : "Guest"),
      header: "Type",
      meta: { label: "Type", width: "status" },
      cell: ({ row }) => <TypeBadge a={row.original} />,
    },
    {
      accessorKey: "checkedInAtFormatted",
      header: "Checked in at",
      meta: { label: "Checked in at", width: "date" },
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.checkedInAtFormatted}</span>
      ),
    },
  ]
}

export function CheckinAttendeesTable({
  eventId,
  attendees,
}: {
  eventId: string
  attendees: CheckinAttendeeRow[]
}) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const columns = useMemo(() => buildColumns(eventId), [eventId])

  const filtered = useMemo(
    () =>
      attendees.filter((a) => {
        if (typeFilter === "member" && (!a.isMember || a.isVolunteer)) return false
        if (typeFilter === "guest" && (a.isMember || a.isVolunteer)) return false
        if (typeFilter === "volunteer" && !a.isVolunteer) return false
        return true
      }),
    [attendees, typeFilter],
  )

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border bg-muted/30 px-3 py-2">
        <ToggleGroup
          type="single"
          value={typeFilter}
          onValueChange={(v) => setTypeFilter((v || "all") as TypeFilter)}
          className="gap-1"
        >
          <ToggleGroupItem value="all" className="h-7 px-3 text-xs">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="member" className="h-7 px-3 text-xs">
            Members
          </ToggleGroupItem>
          <ToggleGroupItem value="guest" className="h-7 px-3 text-xs">
            Guests
          </ToggleGroupItem>
          <ToggleGroupItem value="volunteer" className="h-7 px-3 text-xs">
            Volunteers
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {attendees.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <p className="text-sm">No one has checked in yet.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
          <p className="text-sm">No attendees match the current filter.</p>
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="divide-y rounded-lg border sm:hidden">
            {filtered.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={attendeeHref(eventId, a)} className={`truncate text-sm ${linkClassName}`}>
                    {a.name ?? <span className="text-muted-foreground italic">No name</span>}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <TypeBadge a={a} />
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {a.isReturner ? (
                    <Badge variant="secondary">Returning</Badge>
                  ) : (
                    <Badge>New</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{a.checkedInAtFormatted}</span>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:flex sm:flex-1 sm:flex-col">
            <DataTable
              tableKey="event.checkin-attendees"
              rowLabel={{ one: "attendee", many: "attendees" }}
              columns={columns}
              data={filtered}
              hidePagination
            />
          </div>
        </>
      )}
    </div>
  )
}
