"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  IconCalendarRepeat,
  IconCalendarEvent,
  IconCopy,
  IconPencil,
  IconSettings,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

// ─── Types ────────────────────────────────────────────────────────────────────

type EventDashboardData = {
  id: string
  name: string
  description: string | null
  type: "OneTime" | "MultiDay" | "Recurring"
  startDate: string
  endDate: string
  price: number | null
  registrationStart: string | null
  registrationEnd: string | null
  recurrenceDayOfWeek: number | null
  recurrenceFrequency: "Weekly" | "Biweekly" | "Monthly" | null
  recurrenceEndDate: string | null
  ministries: string[]
  registrantCount: number
  paidCount: number
  attendedCount: number
  occurrenceCount: number
  totalCheckIns: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const FREQ_LABELS: Record<string, string> = {
  Weekly: "Weekly",
  Biweekly: "Every two weeks",
  Monthly: "Monthly",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
}

function getRegistrationStatus(
  start: string | null,
  end: string | null
): "open" | "upcoming" | "closed" | null {
  if (!start || !end) return null
  const now = new Date()
  if (now < new Date(start)) return "upcoming"
  if (now > new Date(end)) return "closed"
  return "open"
}

function formatRecurringSchedule(
  dayOfWeek: number | null,
  frequency: string | null
): string {
  const day = dayOfWeek != null ? DAY_NAMES[dayOfWeek] : null
  const freq = frequency ? FREQ_LABELS[frequency] : null
  if (day && freq) return `Every ${day} · ${freq}`
  if (day) return `Every ${day}`
  if (freq) return freq
  return "Recurring"
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EventDashboardClient({ event }: { event: EventDashboardData }) {
  const router = useRouter()

  const regStatus = getRegistrationStatus(event.registrationStart, event.registrationEnd)
  const isRecurring = event.type === "Recurring"
  const isMultiDay = event.type === "MultiDay"
  const isPaidEvent = event.price != null

  function copyLink(path: string) {
    const url = `${window.location.origin}${path}`
    navigator.clipboard.writeText(url)
    toast.success("Link copied")
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          {event.ministries.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {event.ministries.join(" · ")}
            </p>
          )}
          {event.description && (
            <p className="text-sm text-muted-foreground">{event.description}</p>
          )}
          {isRecurring && (
            <div className="flex items-center gap-2 pt-0.5">
              <Badge variant="secondary" className="gap-1.5">
                <IconCalendarRepeat className="size-3" />
                {formatRecurringSchedule(event.recurrenceDayOfWeek, event.recurrenceFrequency)}
              </Badge>
              {event.recurrenceEndDate ? (
                <span className="text-xs text-muted-foreground">
                  Ends {formatDate(event.recurrenceEndDate)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Ongoing</span>
              )}
            </div>
          )}
          {isMultiDay && (
            <div className="flex items-center gap-2 pt-0.5">
              <Badge variant="secondary" className="gap-1.5">
                <IconCalendarEvent className="size-3" />
                Multi-day event
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDate(event.startDate)} – {formatDate(event.endDate)}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/event/${event.id}/settings`}>
              <IconSettings className="mr-2 size-4" />
              Settings
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push(`/events/${event.id}/edit`)}>
            <IconPencil className="mr-2 size-4" />
            Edit
          </Button>
        </div>
      </div>

      {/* Stats */}
      {isRecurring ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Series Start</p>
            <p className="mt-0.5 text-sm font-medium">{formatDate(event.startDate)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Registered</p>
            <p className="mt-0.5 text-sm font-medium">{event.registrantCount}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              {event.occurrenceCount === 1 ? "1 Session" : `${event.occurrenceCount} Sessions`}
            </p>
            <p className="mt-0.5 text-sm font-medium">{event.totalCheckIns} total check-ins</p>
          </div>
        </div>
      ) : isMultiDay ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="mt-0.5 text-sm font-medium">{event.occurrenceCount} days</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Registered</p>
            <p className="mt-0.5 text-sm font-medium">{event.registrantCount}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Total Check-ins</p>
            <p className="mt-0.5 text-sm font-medium">{event.totalCheckIns}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Date</p>
            <p className="mt-0.5 text-sm font-medium">
              {formatDate(event.startDate)}
              {event.startDate !== event.endDate && <> – {formatDate(event.endDate)}</>}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Price</p>
            <p className="mt-0.5 text-sm font-medium">
              {isPaidEvent
                ? `₱${(event.price! / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                : "Free"}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Registration</p>
            <p className="mt-0.5 text-sm font-medium">
              {regStatus === "open" && <span className="text-green-600">Open</span>}
              {regStatus === "upcoming" && <span className="text-yellow-600">Upcoming</span>}
              {regStatus === "closed" && <span className="text-muted-foreground">Closed</span>}
              {!regStatus && <span className="text-muted-foreground">—</span>}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Registrants</p>
            <p className="mt-0.5 text-sm font-medium">
              {event.registrantCount}
              {isPaidEvent && ` · ${event.paidCount} paid`}
              {` · ${event.attendedCount} attended`}
            </p>
          </div>
        </div>
      )}

      {/* Public links */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => copyLink(`/events/${event.id}/register`)}>
          <IconCopy className="mr-2 size-3.5" />
          Registration link
        </Button>
        {!isRecurring && !isMultiDay && (
          <Button variant="outline" size="sm" onClick={() => copyLink(`/events/${event.id}/checkin`)}>
            <IconCopy className="mr-2 size-3.5" />
            Check-in link
          </Button>
        )}
      </div>
    </div>
  )
}
