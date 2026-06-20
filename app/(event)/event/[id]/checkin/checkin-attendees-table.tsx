"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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

export function CheckinAttendeesTable({
  eventId,
  attendees,
}: {
  eventId: string
  attendees: CheckinAttendeeRow[]
}) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")

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
          <div className="hidden overflow-x-auto rounded-lg border sm:block">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Checked in at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={attendeeHref(eventId, a)} className={linkClassName}>
                        {a.name ?? <span className="text-muted-foreground italic">No name</span>}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {a.isReturner ? (
                        <Badge variant="secondary">Returning</Badge>
                      ) : (
                        <Badge>New</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <TypeBadge a={a} />
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.checkedInAtFormatted}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
