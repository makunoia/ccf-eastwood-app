"use client"

import * as React from "react"
import Link from "next/link"
import { IconCheck } from "@tabler/icons-react"

import { FilterBar, FilterField } from "@/components/filter-bar"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

type PersonEvent = {
  eventId: string
  eventName: string
  /** The registrant id, or the volunteer id when `kind` is Volunteer. */
  registrantId: string
  kind: "Registrant" | "Volunteer"
  checkedIn: boolean
  standing: "CheckedIn" | "OnDay" | "SeriesOnly"
}

const STANDING_TITLE: Record<PersonEvent["standing"], string> = {
  CheckedIn: "checked in",
  OnDay: "registered for this day",
  SeriesOnly: "on the series — no sign-up or check-in for this day",
}

const VOLUNTEER_STANDING_TITLE: Record<PersonEvent["standing"], string> = {
  CheckedIn: "serving — checked in",
  OnDay: "serving on this day",
  SeriesOnly: "serving on the series",
}

/**
 * A person's record for the day links to where that record is edited, and the
 * two live in different places: a registration on the event's registrants
 * screen, a sign-up to serve on its volunteers screen. Sending a volunteer to
 * `/registrants/<volunteer id>` would 404 on an id the registrants table has
 * never held.
 */
function personEventHref(e: PersonEvent): string {
  return e.kind === "Volunteer"
    ? `/event/${e.eventId}/volunteers/${e.registrantId}`
    : `/event/${e.eventId}/registrants/${e.registrantId}`
}

type PersonType = "Volunteer" | "Member" | "Guest"

const TYPE_VARIANT: Record<PersonType, "secondary" | "outline" | "default"> = {
  Volunteer: "default",
  Member: "secondary",
  Guest: "outline",
}

type Person = {
  key: string
  firstName: string
  lastName: string
  phone: string | null
  isMember: boolean
  type: PersonType
  events: PersonEvent[]
  registeredAt: string | null
}

export function ClusterRegistrantsClient({
  people,
  events,
}: {
  people: Person[]
  events: { id: string; name: string }[]
}) {
  const [search, setSearch] = React.useState("")
  const [eventId, setEventId] = React.useState("")
  const [type, setType] = React.useState("")

  const filtered = people.filter((p) => {
    if (eventId && !p.events.some((e) => e.eventId === eventId)) return false
    // "Attendees" is everyone not serving, so the two options partition the list
    // rather than overlapping — a volunteer is a Member too, and offering
    // Member/Guest/Volunteer as peers would double-count them.
    if (type === "Volunteer" && p.type !== "Volunteer") return false
    if (type === "Attendee" && p.type === "Volunteer") return false
    if (search) {
      const q = search.toLowerCase()
      const name = `${p.firstName} ${p.lastName}`.toLowerCase()
      if (!name.includes(q) && !(p.phone ?? "").includes(search)) return false
    }
    return true
  })

  return (
    <>
      <FilterBar
        searchValue={search}
        searchPlaceholder="Search name or mobile…"
        onSearch={setSearch}
        activeCount={(eventId ? 1 : 0) + (type ? 1 : 0)}
        onClear={() => {
          setSearch("")
          setEventId("")
          setType("")
        }}
      >
        <FilterField label="Event">
          <Select
            value={eventId || "all"}
            onValueChange={(v) => setEventId(v === "all" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Type">
          <Select
            value={type || "all"}
            onValueChange={(v) => setType(v === "all" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Everyone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everyone</SelectItem>
              <SelectItem value="Attendee">Attendees</SelectItem>
              <SelectItem value="Volunteer">Volunteers</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
      </FilterBar>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No registrants{search || eventId || type ? " match the current filters" : " yet"}.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Registered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.key}>
                  <TableCell className="whitespace-nowrap align-top">
                    <Link
                      href={personEventHref(p.events[0])}
                      className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                    >
                      {p.firstName} {p.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {p.events.map((e) => (
                        <Link
                          key={e.eventId}
                          href={personEventHref(e)}
                          title={`${e.eventName} — ${
                            e.kind === "Volunteer"
                              ? VOLUNTEER_STANDING_TITLE[e.standing]
                              : STANDING_TITLE[e.standing]
                          }`}
                        >
                          <Badge
                            variant={e.checkedIn ? "default" : "outline"}
                            className={cn(
                              "font-normal transition-colors",
                              e.checkedIn
                                ? "hover:bg-primary/85"
                                : "hover:bg-muted",
                              // Registered, but nothing ties it to this day.
                              // Dimmed rather than hidden — the registration is
                              // real, and dropping the chip was what made these
                              // people look unregistered while the event screen
                              // refused to add them again.
                              e.standing === "SeriesOnly" &&
                                "border-dashed text-muted-foreground"
                            )}
                          >
                            {e.checkedIn && <IconCheck className="size-3" />}
                            {e.eventName}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={TYPE_VARIANT[p.type]}>{p.type}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap align-top text-muted-foreground">
                    {p.registeredAt
                      ? new Date(p.registeredAt).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
