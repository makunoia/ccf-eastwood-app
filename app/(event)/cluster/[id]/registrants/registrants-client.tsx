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
  registrantId: string
  checkedIn: boolean
  standing: "CheckedIn" | "OnDay" | "SeriesOnly"
}

const STANDING_TITLE: Record<PersonEvent["standing"], string> = {
  CheckedIn: "checked in",
  OnDay: "registered for this day",
  SeriesOnly: "on the series — no sign-up or check-in for this day",
}

type Person = {
  key: string
  firstName: string
  lastName: string
  phone: string | null
  isMember: boolean
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

  const filtered = people.filter((p) => {
    if (eventId && !p.events.some((e) => e.eventId === eventId)) return false
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
        activeCount={eventId ? 1 : 0}
        onClear={() => {
          setSearch("")
          setEventId("")
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
      </FilterBar>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No registrants{search || eventId ? " match the current filters" : " yet"}.
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
                      href={`/event/${p.events[0].eventId}/registrants/${p.events[0].registrantId}`}
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
                          href={`/event/${e.eventId}/registrants/${e.registrantId}`}
                          title={`${e.eventName} — ${STANDING_TITLE[e.standing]}`}
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
                    <Badge variant={p.isMember ? "secondary" : "outline"}>
                      {p.isMember ? "Member" : "Guest"}
                    </Badge>
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
