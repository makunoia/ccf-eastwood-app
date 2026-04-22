"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  IconCalendar,
  IconCalendarRepeat,
  IconCopy,
  IconPencil,
  IconSettings,
  IconUserCheck,
  IconUserQuestion,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

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
  period: "7d" | "30d" | "90d" | "all"
  roleFilter: "all" | "Timothy" | "Leader"
  averageAttendance: number
  uniqueAttendees: number
  newLeaders: Array<{
    id: string
    name: string
    updatedAt: string
  }>
  confirmedGuestsNowMembers: Array<{
    id: string
    name: string
    memberStatus: "Member" | "Timothy" | "Leader" | null
    smallGroupName: string
    resolvedAt: string
  }>
  participantsWithoutSmallGroup: Array<{
    id: string
    name: string
    type: "Member" | "Guest"
  }>
  attendanceSeries: Array<{
    date: string
    attendees: number
  }>
  confirmedVolunteers: Array<{
    id: string
    name: string
  }>
  unconfirmedVolunteers: Array<{
    id: string
    name: string
    status: "Pending" | "Confirmed" | "Rejected"
  }>
  pendingVolunteerCount: number
  rejectedVolunteerCount: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const FREQ_LABELS: Record<string, string> = {
  Weekly: "Weekly",
  Biweekly: "Every two weeks",
  Monthly: "Monthly",
}

const PERIODS: Array<{ value: EventDashboardData["period"]; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
]

const ROLE_FILTERS: Array<{ value: EventDashboardData["roleFilter"]; label: string }> = [
  { value: "all", label: "All" },
  { value: "Timothy", label: "Timothy" },
  { value: "Leader", label: "Leader" },
]

const attendanceChartConfig = {
  attendees: {
    label: "Attendance",
    color: "var(--primary)",
  },
} satisfies ChartConfig

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

function formatAverage(value: number) {
  if (Number.isInteger(value)) return value.toLocaleString()
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EventDashboardClient({ event }: { event: EventDashboardData }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const regStatus = getRegistrationStatus(event.registrationStart, event.registrationEnd)
  const isRecurring = event.type === "Recurring"
  const isMultiDay = event.type === "MultiDay"
  const isSeriesEvent = isRecurring || isMultiDay
  const isPaidEvent = event.price != null

  function copyLink(path: string) {
    const url = `${window.location.origin}${path}`
    navigator.clipboard.writeText(url)
    toast.success("Link copied")
  }

  function withQuery(updates: Partial<Pick<EventDashboardData, "period" | "roleFilter">>) {
    const params = new URLSearchParams(searchParams.toString())
    if (updates.period) params.set("period", updates.period)
    if (updates.roleFilter) params.set("roleFilter", updates.roleFilter)
    const query = params.toString()
    return query ? `${pathname}?${query}` : pathname
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
                <IconCalendar className="size-3" />
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

      {/* Filters */}
      <div className="rounded-lg border p-3">
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground mb-2">
          Period
        </p>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((period) => (
            <Button
              key={period.value}
              size="sm"
              variant={event.period === period.value ? "default" : "outline"}
              asChild
            >
              <Link href={withQuery({ period: period.value })}>{period.label}</Link>
            </Button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border px-5 py-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
              Average Attendance
            </p>
            <span className="text-muted-foreground/40">
              <IconUsers className="size-4" />
            </span>
          </div>
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {formatAverage(event.averageAttendance)}
          </p>
          <p className="text-xs text-muted-foreground/60">
            {isSeriesEvent ? "Average check-ins per session" : "Attendees for this event"}
          </p>
        </div>

        <div className="rounded-lg border px-5 py-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
              Unique Attendees
            </p>
            <span className="text-muted-foreground/40">
              <IconUserCheck className="size-4" />
            </span>
          </div>
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {event.uniqueAttendees.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground/60">Distinct participants in selected period</p>
        </div>

        <div className="rounded-lg border px-5 py-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
              Not In Small Group Yet
            </p>
            <span className="text-muted-foreground/40">
              <IconUserQuestion className="size-4" />
            </span>
          </div>
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {event.participantsWithoutSmallGroup.length.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground/60">Members and guests still unassigned</p>
        </div>

        <div className="rounded-lg border px-5 py-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
              Volunteers
            </p>
            <span className="text-muted-foreground/40">
              <IconUsersGroup className="size-4" />
            </span>
          </div>
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {event.confirmedVolunteers.length} / {event.unconfirmedVolunteers.length}
          </p>
          <p className="text-xs text-muted-foreground/60">Confirmed / Unconfirmed</p>
        </div>
      </div>

      {/* Attendance graph */}
      {isSeriesEvent && (
        <Card>
          <CardHeader>
            <CardTitle>Attendance by Session</CardTitle>
            <CardDescription>
              {event.attendanceSeries.length > 0
                ? "Attendance trend in selected period"
                : "No attendance data yet in selected period"}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
            <ChartContainer config={attendanceChartConfig} className="aspect-auto h-65 w-full">
              <AreaChart data={event.attendanceSeries}>
                <defs>
                  <linearGradient id="fillAttendees" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-attendees)" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="var(--color-attendees)" stopOpacity={0.15} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                    })
                  }
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={32}
                  allowDecimals={false}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      labelFormatter={(value) =>
                        new Date(value).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      }
                    />
                  }
                />
                <Area
                  dataKey="attendees"
                  type="natural"
                  fill="url(#fillAttendees)"
                  stroke="var(--color-attendees)"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>New Small Group Leaders</CardTitle>
            <CardDescription>Leaders identified in selected period</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {event.newLeaders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No new leaders in this period.</p>
            ) : (
              event.newLeaders.map((leader) => (
                <div key={leader.id} className="rounded-md border px-3 py-2">
                  <p className="text-sm font-medium">{leader.name}</p>
                  <p className="text-xs text-muted-foreground">Updated {formatDate(leader.updatedAt)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Guests Confirmed To Small Group</CardTitle>
            <CardDescription>Guests confirmed and now small group members</CardDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              {ROLE_FILTERS.map((filter) => (
                <Button
                  key={filter.value}
                  size="sm"
                  variant={event.roleFilter === filter.value ? "default" : "outline"}
                  asChild
                >
                  <Link href={withQuery({ roleFilter: filter.value })}>{filter.label}</Link>
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {event.confirmedGuestsNowMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No confirmed guests matched this filter.</p>
            ) : (
              event.confirmedGuestsNowMembers.map((guest) => (
                <div key={guest.id} className="rounded-md border px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{guest.name}</p>
                    <Badge variant="secondary">{guest.memberStatus ?? "Member"}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {guest.smallGroupName} · Confirmed {formatDate(guest.resolvedAt)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Participants Without Small Group</CardTitle>
            <CardDescription>People who still need assignment</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {event.participantsWithoutSmallGroup.length === 0 ? (
              <p className="text-sm text-muted-foreground">Everyone is currently assigned.</p>
            ) : (
              event.participantsWithoutSmallGroup.slice(0, 20).map((person) => (
                <div key={person.id} className="rounded-md border px-3 py-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{person.name}</p>
                  <Badge variant="outline">{person.type}</Badge>
                </div>
              ))
            )}
            {event.participantsWithoutSmallGroup.length > 20 && (
              <p className="text-xs text-muted-foreground">
                Showing 20 of {event.participantsWithoutSmallGroup.length} participants.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Volunteer Confirmation</CardTitle>
            <CardDescription>
              {event.confirmedVolunteers.length} confirmed · {event.unconfirmedVolunteers.length} unconfirmed
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Confirmed</p>
              {event.confirmedVolunteers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No confirmed volunteers yet.</p>
              ) : (
                event.confirmedVolunteers.slice(0, 10).map((volunteer) => (
                  <div key={volunteer.id} className="rounded-md border px-3 py-2 text-sm font-medium">
                    {volunteer.name}
                  </div>
                ))
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Unconfirmed</p>
              {event.unconfirmedVolunteers.length === 0 ? (
                <p className="text-sm text-muted-foreground">All volunteers are confirmed.</p>
              ) : (
                event.unconfirmedVolunteers.slice(0, 10).map((volunteer) => (
                  <div key={`${volunteer.id}-${volunteer.status}`} className="rounded-md border px-3 py-2">
                    <p className="text-sm font-medium">{volunteer.name}</p>
                    <p className="text-xs text-muted-foreground">{volunteer.status}</p>
                  </div>
                ))
              )}
              {event.unconfirmedVolunteers.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Pending: {event.pendingVolunteerCount} · Rejected: {event.rejectedVolunteerCount}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Public links */}
      {!isRecurring && !isMultiDay && (
        <div className="flex flex-wrap gap-2">
          <div className="rounded-lg border p-3 text-sm">
            <p>
              {formatDate(event.startDate)}
              {event.startDate !== event.endDate && <> – {formatDate(event.endDate)}</>}
              {" · "}
              {isPaidEvent
                ? `₱${(event.price! / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                : "Free"}
              {" · "}
              {regStatus === "open" && <span className="text-green-600">Registration Open</span>}
              {regStatus === "upcoming" && <span className="text-yellow-600">Registration Upcoming</span>}
              {regStatus === "closed" && <span className="text-muted-foreground">Registration Closed</span>}
              {!regStatus && <span className="text-muted-foreground">Registration N/A</span>}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => copyLink(`/events/${event.id}/checkin`)}>
            <IconCopy className="mr-2 size-3.5" />
            Check-in link
          </Button>
        </div>
      )}
    </div>
  )
}
