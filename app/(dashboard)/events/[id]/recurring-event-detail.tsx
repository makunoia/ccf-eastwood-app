"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  IconArrowLeft,
  IconCalendarRepeat,
  IconCopy,
  IconPencil,
  IconSettings,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
  createdAt: Date
}

type OccurrenceRow = {
  id: string
  date: Date
  _count: { attendees: number }
}

type RecurringEvent = {
  id: string
  name: string
  description: string | null
  startDate: Date
  recurrenceEndDate: Date | null
  recurrenceDayOfWeek: number | null
  recurrenceFrequency: "Weekly" | "Biweekly" | "Monthly" | null
  ministry: { id: string; name: string }
  registrants: Registrant[]
  occurrences: OccurrenceRow[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const FREQ_LABELS: Record<string, string> = {
  Weekly: "Weekly",
  Biweekly: "Every two weeks",
  Monthly: "Monthly",
}

function formatSchedule(event: RecurringEvent): string {
  const day = event.recurrenceDayOfWeek != null ? DAY_NAMES[event.recurrenceDayOfWeek] : null
  const freq = event.recurrenceFrequency ? FREQ_LABELS[event.recurrenceFrequency] : null
  if (day && freq) return `Every ${day} · ${freq}`
  if (day) return `Every ${day}`
  if (freq) return freq
  return "Recurring"
}

function formatOccurrenceDate(date: Date): string {
  return date.toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-PH", {
    month: "long",
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

// ─── Occurrences tab ──────────────────────────────────────────────────────────

function OccurrencesTab({ occurrences, eventId }: { occurrences: OccurrenceRow[]; eventId: string }) {
  if (occurrences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <IconCalendarRepeat className="size-8" />
        <p className="text-sm">No sessions recorded yet.</p>
        <p className="text-xs">Open the check-in link to start tracking attendance.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Date</th>
            <th className="px-4 py-3 text-left font-medium">Attendance</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {occurrences.map((o) => (
            <tr key={o.id} className="border-b last:border-0">
              <td className="px-4 py-3 font-medium">{formatOccurrenceDate(o.date)}</td>
              <td className="px-4 py-3">
                <Badge variant="secondary">{o._count.attendees} attended</Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/events/${eventId}/occurrences/${o.id}`}>View</Link>
                </Button>
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

export function RecurringEventDetail({ event }: { event: RecurringEvent }) {
  const router = useRouter()

  const totalAttendance = event.occurrences.reduce((sum, o) => sum + o._count.attendees, 0)

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
          <p className="text-sm text-muted-foreground">{event.ministry.name}</p>
          <div className="flex items-center gap-2 pt-0.5">
            <Badge variant="secondary" className="gap-1.5">
              <IconCalendarRepeat className="size-3" />
              {formatSchedule(event)}
            </Badge>
            {event.recurrenceEndDate ? (
              <span className="text-xs text-muted-foreground">
                Ends {formatDate(event.recurrenceEndDate)}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Ongoing</span>
            )}
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
          <p className="text-xs text-muted-foreground">Series Start</p>
          <p className="mt-0.5 text-sm font-medium">{formatDate(event.startDate)}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Registered</p>
          <p className="mt-0.5 text-sm font-medium">{event.registrants.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">
            {event.occurrences.length === 1
              ? "1 Session"
              : `${event.occurrences.length} Sessions`}
          </p>
          <p className="mt-0.5 text-sm font-medium">
            {totalAttendance} total check-ins
          </p>
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => copyLink(`/events/${event.id}/checkin`)}
        >
          <IconCopy className="mr-2 size-3.5" />
          Check-in link
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="occurrences" className="flex flex-1 flex-col">
        <TabsList className="w-fit">
          <TabsTrigger value="occurrences">
            Sessions ({event.occurrences.length})
          </TabsTrigger>
          <TabsTrigger value="registrants">
            Registrants ({event.registrants.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="occurrences" className="mt-4 flex-1">
          <OccurrencesTab occurrences={event.occurrences} eventId={event.id} />
        </TabsContent>

        <TabsContent value="registrants" className="mt-4 flex-1">
          <RegistrantsTab registrants={event.registrants} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
