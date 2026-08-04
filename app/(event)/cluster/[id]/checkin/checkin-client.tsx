"use client"

import * as React from "react"
import Link from "next/link"
import { IconCheck, IconUserPlus } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Person = {
  key: string
  name: string
  phone: string | null
  isMember: boolean
  events: { eventId: string; eventName: string; checkedIn: boolean }[]
  fullyCheckedIn: boolean
}

/**
 * Monitoring board — live check-in status for the day's events: one-time events,
 * and recurring events through the session this day is linked to. Check-in
 * itself happens on the check-in and walk-in links (Forms has every one); this
 * page just shows who's arrived.
 */
export function ClusterCheckinClient({
  people,
  hasCheckinEvents,
  walkInHref,
}: {
  people: Person[]
  hasCheckinEvents: boolean
  /** Door link for someone who isn't registered yet — null without write access. */
  walkInHref?: string | null
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

  // Same-tab navigation, not a new window: this is a PWA, and the walk-in form
  // already carries a Back link to this board.
  const walkInButton = walkInHref ? (
    <Button asChild variant="outline" className="w-full sm:w-auto">
      <Link href={walkInHref}>
        <IconUserPlus className="size-4" />
        Walk-in registration
      </Link>
    </Button>
  ) : null

  if (!hasCheckinEvents) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nothing to monitor yet. One-time events appear here automatically;
          a recurring event appears once its cluster link names a session.
        </div>
        {walkInButton}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or mobile…"
          className="sm:max-w-xs"
        />
        {walkInButton}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {search ? "No one matches that search." : "No registrants yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((person) => (
            <div
              key={person.key}
              className="flex items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {person.name}
                  {person.isMember && (
                    <Badge variant="secondary" className="ml-2">
                      Member
                    </Badge>
                  )}
                </p>
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
              </div>
              {person.fullyCheckedIn && (
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-green-600">
                  <IconCheck className="size-4" />
                  Checked in
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
