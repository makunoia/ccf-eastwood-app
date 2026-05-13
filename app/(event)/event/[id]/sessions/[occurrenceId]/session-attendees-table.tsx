"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export type AttendeeRow = {
  id: string
  name: string
  checkedInAtFormatted: string
  isReturner: boolean
  isMember: boolean
  isVolunteer: boolean
  breakoutGroupIds: string[]
}

export type BreakoutGroupOption = {
  id: string
  name: string
}

type TypeFilter = "all" | "member" | "guest" | "volunteer"

export function SessionAttendeesTable({
  attendees,
  breakoutGroups,
}: {
  attendees: AttendeeRow[]
  breakoutGroups: BreakoutGroupOption[]
}) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [breakoutFilter, setBreakoutFilter] = useState("all")

  const filtered = attendees.filter((a) => {
    if (typeFilter === "member" && !a.isMember) return false
    if (typeFilter === "guest" && a.isMember) return false
    if (typeFilter === "volunteer" && !a.isVolunteer) return false
    if (breakoutFilter !== "all" && !a.breakoutGroupIds.includes(breakoutFilter)) return false
    return true
  })

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">
          Attendees
          {filtered.length !== attendees.length && (
            <span className="ml-2 font-normal text-muted-foreground">
              {filtered.length} of {attendees.length}
            </span>
          )}
          {filtered.length === attendees.length && (
            <span className="ml-2 font-normal text-muted-foreground">{attendees.length}</span>
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
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

          {breakoutGroups.length > 0 && (
            <Select value={breakoutFilter} onValueChange={setBreakoutFilter}>
              <SelectTrigger className="h-7 w-[160px] text-xs">
                <SelectValue placeholder="Breakout group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All groups</SelectItem>
                {breakoutGroups.map((bg) => (
                  <SelectItem key={bg.id} value={bg.id}>
                    {bg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {attendees.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <p className="text-sm">No one checked in for this session yet.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
          <p className="text-sm">No attendees match the current filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Checked in at</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3">
                    {a.isReturner ? (
                      <Badge variant="secondary">Returning</Badge>
                    ) : (
                      <Badge>New</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {a.isMember ? (
                        <Badge variant="secondary">Member</Badge>
                      ) : (
                        <Badge variant="outline">Guest</Badge>
                      )}
                      {a.isVolunteer && (
                        <Badge variant="outline" className="text-amber-600 border-amber-400">
                          Volunteer
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{a.checkedInAtFormatted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
