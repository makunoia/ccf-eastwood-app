"use client"

import * as React from "react"
import { IconCheck } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

type Person = {
  key: string
  name: string
  phone: string | null
  isMember: boolean
  /** Serving on the day rather than attending it — see the roster's person type. */
  isVolunteer: boolean
  events: { eventId: string; eventName: string; checkedIn: boolean }[]
  fullyCheckedIn: boolean
}

/**
 * Monitoring board — live check-in status for the day's events: one-time events,
 * and recurring events through the session this day is linked to. Check-in
 * itself happens on the links in the Shortcuts section above (and on the Forms
 * page); this list just shows who's arrived.
 *
 * `showEventBreakdown` is off on a Collab day. There a person holds exactly one
 * of the day's events — their ministry's — so the badge row under every name is
 * one badge repeating the same word down the whole list, and the day is built to
 * stop naming the split in the first place. Collapsed, an arrival is a single
 * line: who they are on the left, whether they're in on the right. The state has
 * to be said in words there, because the badges that used to carry it are gone.
 */
export function ClusterCheckinClient({
  people,
  hasCheckinEvents,
  showEventBreakdown = true,
}: {
  people: Person[]
  hasCheckinEvents: boolean
  showEventBreakdown?: boolean
}) {
  const [search, setSearch] = React.useState("")

  const filtered = search
    ? people.filter((p) => {
        const q = search.toLowerCase()
        return (
          p.name.toLowerCase().includes(q) || (p.phone ?? "").includes(search)
        )
      })
    : people

  if (!hasCheckinEvents) {
    return (
      <div className="space-y-2">
        <h3 className="type-label text-muted-foreground">Arrivals</h3>
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nothing to monitor yet. One-time events appear here automatically;
          a recurring event appears once its cluster link names a session.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="type-label text-muted-foreground">Arrivals</h3>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name or mobile…"
        className="sm:max-w-xs"
      />

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {search ? "No one matches that search." : "No registrants yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((person) => (
            <div
              key={person.key}
              className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {person.name}
                  {/* Volunteer wins over Member: every volunteer is a member, so
                      the badge that says less would hide why they're here. */}
                  {(person.isVolunteer || person.isMember) && (
                    <Badge
                      variant={person.isVolunteer ? "default" : "secondary"}
                      className="ml-2"
                    >
                      {person.isVolunteer ? "Volunteer" : "Member"}
                    </Badge>
                  )}
                </p>
                {showEventBreakdown && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {person.events.map((e) => (
                      <Badge
                        key={e.eventId}
                        variant={e.checkedIn ? "default" : "outline"}
                        className="font-normal"
                      >
                        {e.checkedIn && <IconCheck className="size-3" />}
                        {e.eventName}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              {person.fullyCheckedIn ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-green-600">
                  <IconCheck className="size-4" />
                  Checked in
                </span>
              ) : (
                // Only with the breakdown hidden: with it on, the outline badges
                // already say who hasn't arrived, and a second "Not in yet"
                // beside them would be the page saying one thing twice.
                !showEventBreakdown && (
                  <span className="shrink-0 text-sm text-muted-foreground">
                    Not in yet
                  </span>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
