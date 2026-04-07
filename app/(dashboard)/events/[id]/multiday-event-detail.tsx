"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  IconArrowLeft,
  IconCalendarEvent,
  IconCopy,
  IconPencil,
  IconSettings,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BreakoutGroupsTab } from "./breakouts-tab"
import { VolunteersTab, type VolunteerGroup } from "./volunteers-tab"

// ─── Types ────────────────────────────────────────────────────────────────────

type Member = {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
}

type Guest = {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
}

type Registrant = {
  id: string
  memberId: string | null
  member: Member | null
  guest: Guest | null
  firstName: string | null
  lastName: string | null
  nickname: string | null
  mobileNumber: string | null
  createdAt: Date
}

type OccurrenceRow = {
  id: string
  date: Date
  _count: { attendees: number }
}

type LedGroup = {
  id: string
  name: string
  lifeStageId: string | null
  genderFocus: string | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: string | null
  locationCity: string | null
}
type Volunteer = {
  id: string
  status: string
  notes: string | null
  member: { id: string; firstName: string; lastName: string; ledGroups: LedGroup[] }
  committee: { id: string; name: string }
  preferredRole: { id: string; name: string }
  assignedRole: { id: string; name: string } | null
}

type MinistryForEvent = {
  id: string
  name: string
  lifeStage: { id: string; name: string } | null
  volunteers: Volunteer[]
}

type BreakoutGroupMemberRow = {
  breakoutGroupId: string
  registrantId: string
  assignedAt: Date
  registrant: {
    id: string
    memberId: string | null
    guestId: string | null
    firstName: string | null
    lastName: string | null
    nickname: string | null
    mobileNumber: string | null
    member: { id: string; firstName: string; lastName: string } | null
    guest: { id: string; firstName: string; lastName: string } | null
  }
}

type BreakoutGroupData = {
  id: string
  name: string
  facilitatorId: string | null
  facilitator: { id: string; member: { id: string; firstName: string; lastName: string } } | null
  coFacilitatorId: string | null
  coFacilitator: { id: string; member: { id: string; firstName: string; lastName: string } } | null
  memberLimit: number | null
  lifeStageId: string | null
  lifeStage: { id: string; name: string } | null
  genderFocus: string | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: string | null
  locationCity: string | null
  members: BreakoutGroupMemberRow[]
}

type MultiDayEvent = {
  id: string
  name: string
  description: string | null
  startDate: Date
  endDate: Date
  ministries: { ministry: MinistryForEvent }[]
  registrants: Registrant[]
  occurrences: OccurrenceRow[]
  volunteers: Volunteer[]
  breakoutGroups: BreakoutGroupData[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function formatDayDate(date: Date): string {
  return date.toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function registrantDisplayName(r: Registrant): string {
  if (r.member) return `${r.member.firstName} ${r.member.lastName}`
  if (r.guest)  return `${r.guest.firstName} ${r.guest.lastName}`
  return `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()
}

function registrantContact(r: Registrant): string | null {
  if (r.member) return r.member.phone ?? r.member.email
  if (r.guest)  return r.guest.phone ?? r.guest.email
  return null
}

// ─── Days tab ─────────────────────────────────────────────────────────────────

function DaysTab({ occurrences, eventId }: { occurrences: OccurrenceRow[]; eventId: string }) {
  function copyCheckinLink(occurrenceId: string) {
    const url = `${window.location.origin}/events/${eventId}/checkin/${occurrenceId}`
    navigator.clipboard.writeText(url)
    toast.success("Check-in link copied")
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Day</th>
            <th className="px-4 py-3 text-left font-medium">Attendance</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {occurrences.map((o) => (
            <tr key={o.id} className="border-b last:border-0">
              <td className="px-4 py-3 font-medium">{formatDayDate(o.date)}</td>
              <td className="px-4 py-3">
                <Badge variant="secondary">{o._count.attendees} attended</Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyCheckinLink(o.id)}
                  >
                    <IconCopy className="mr-1.5 size-3.5" />
                    Check-in link
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/events/${eventId}/occurrences/${o.id}`}>View</Link>
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Registrants tab ──────────────────────────────────────────────────────────

function RegistrantsTab({ registrants }: { registrants: Registrant[] }) {
  if (registrants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <p className="text-sm">No registrants yet.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Name</th>
            <th className="px-4 py-3 text-left font-medium">Contact</th>
            <th className="px-4 py-3 text-left font-medium">Type</th>
            <th className="px-4 py-3 text-left font-medium">Registered</th>
          </tr>
        </thead>
        <tbody>
          {registrants.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="px-4 py-3 font-medium">{registrantDisplayName(r)}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {registrantContact(r) ?? "—"}
              </td>
              <td className="px-4 py-3">
                {r.memberId
                  ? <Badge variant="secondary">Member</Badge>
                  : <Badge variant="outline">Guest</Badge>}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {r.createdAt.toLocaleDateString("en-PH", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MultiDayEventDetail({ event, lifeStages }: { event: MultiDayEvent; lifeStages: { id: string; name: string }[] }) {
  const router = useRouter()

  const totalAttendance = event.occurrences.reduce((sum, o) => sum + o._count.attendees, 0)

  const volunteerGroups: VolunteerGroup[] = [
    ...event.ministries.map((em) => ({
      label: em.ministry.name,
      source: "ministry" as const,
      volunteers: em.ministry.volunteers,
    })),
    ...(event.volunteers.length > 0 || event.ministries.length === 0
      ? [{ label: "Event", source: "event" as const, volunteers: event.volunteers }]
      : []),
  ]
  const totalVolunteerCount = volunteerGroups.reduce((sum, g) => sum + g.volunteers.length, 0)

  const confirmedVolunteers = [
    ...event.volunteers.filter((v) => v.status === "Confirmed"),
    ...event.ministries.flatMap((em) =>
      em.ministry.volunteers.filter((v) => v.status === "Confirmed")
    ),
  ]

  function copyLink(path: string) {
    const url = `${window.location.origin}${path}`
    navigator.clipboard.writeText(url)
    toast.success("Link copied")
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <Link
          href="/events"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Events
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{event.name}</h2>
          {event.ministries.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {event.ministries.map((em) => em.ministry.name).join(" · ")}
            </p>
          )}
          <div className="flex items-center gap-2 pt-0.5">
            <Badge variant="secondary" className="gap-1.5">
              <IconCalendarEvent className="size-3" />
              Multi-day event
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDate(event.startDate)} – {formatDate(event.endDate)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/events/${event.id}/settings`)}
          >
            <IconSettings className="mr-2 size-4" />
            Settings
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/events/${event.id}/edit`)}
          >
            <IconPencil className="mr-2 size-4" />
            Edit
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Duration</p>
          <p className="mt-0.5 text-sm font-medium">{event.occurrences.length} days</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Registered</p>
          <p className="mt-0.5 text-sm font-medium">{event.registrants.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Total Check-ins</p>
          <p className="mt-0.5 text-sm font-medium">{totalAttendance}</p>
        </div>
      </div>

      {/* Public links */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => copyLink(`/events/${event.id}/register`)}
        >
          <IconCopy className="mr-2 size-3.5" />
          Registration link
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="days" className="flex flex-1 flex-col">
        <TabsList className="w-fit">
          <TabsTrigger value="days">
            Days ({event.occurrences.length})
          </TabsTrigger>
          <TabsTrigger value="registrants">
            Registrants ({event.registrants.length})
          </TabsTrigger>
          <TabsTrigger value="breakouts">Breakout Groups</TabsTrigger>
          <TabsTrigger value="volunteers">
            Volunteers {totalVolunteerCount > 0 && `(${totalVolunteerCount})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="days" className="mt-4 flex-1">
          <DaysTab occurrences={event.occurrences} eventId={event.id} />
        </TabsContent>

        <TabsContent value="registrants" className="mt-4 flex-1">
          <RegistrantsTab registrants={event.registrants} />
        </TabsContent>

        <TabsContent value="breakouts" className="mt-4">
          <BreakoutGroupsTab
            eventId={event.id}
            breakoutGroups={event.breakoutGroups}
            registrants={event.registrants}
            volunteers={confirmedVolunteers}
            lifeStages={lifeStages}
          />
        </TabsContent>

        <TabsContent value="volunteers" className="mt-4">
          <VolunteersTab groups={volunteerGroups} eventId={event.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
