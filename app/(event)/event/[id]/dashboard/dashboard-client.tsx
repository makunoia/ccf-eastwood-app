"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import {
  IconCircleCheck,
  IconCircleOff,
  IconClock,
  IconCopy,
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

import { cn } from "@/lib/utils"

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
    groupStatus: "Member" | "Timothy" | "Leader" | null
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
  brandBackground: string | null
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
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const regStatus = getRegistrationStatus(event.registrationStart, event.registrationEnd)
  const isRecurring = event.type === "Recurring"
  const isMultiDay = event.type === "MultiDay"
  const isSeriesEvent = isRecurring || isMultiDay
  const isPaidEvent = event.price != null

  const totalVolunteers = event.confirmedVolunteers.length + event.unconfirmedVolunteers.length
  const pendingVolunteers = event.unconfirmedVolunteers.filter((v) => v.status === "Pending")
  const rejectedVolunteers = event.unconfirmedVolunteers.filter((v) => v.status === "Rejected")

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
    <div className="flex flex-1 flex-col p-6">
      {/* Event metadata — same three fields render for every event type:
          When (Date / Dates / Schedule), Entry (fee or Free), Registration status.
          A 3-column grid with no vertical dividers keeps the strip visually
          identical across OneTime, MultiDay, and Recurring events. */}
      <div className="flex flex-col gap-5 rounded-lg border bg-card px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <dl className="grid grid-cols-1 gap-x-12 gap-y-4 sm:grid-cols-[1.8fr_1fr_1fr] lg:flex-1">
          <div className="flex flex-col gap-1">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              {isRecurring ? "Schedule" : isMultiDay ? "Dates" : "Date"}
            </dt>
            <dd className="text-sm font-medium text-foreground">
              {isRecurring && (
                <>
                  {formatRecurringSchedule(event.recurrenceDayOfWeek, event.recurrenceFrequency)}
                  {" · "}
                  {event.recurrenceEndDate ? `Ends ${formatDate(event.recurrenceEndDate)}` : "Ongoing"}
                </>
              )}
              {isMultiDay && (
                <>{formatDate(event.startDate)} – {formatDate(event.endDate)}</>
              )}
              {!isSeriesEvent && (
                <>
                  {formatDate(event.startDate)}
                  {event.startDate !== event.endDate && <> – {formatDate(event.endDate)}</>}
                </>
              )}
            </dd>
          </div>

          <div className="flex flex-col gap-1">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Entry
            </dt>
            <dd className="text-sm font-medium text-foreground tabular-nums">
              {/* Recurring events cannot have payment, so "Free" is always accurate */}
              {!isRecurring && isPaidEvent
                ? `₱${(event.price! / 100).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                : "Free"}
            </dd>
          </div>

          <div className="flex flex-col gap-1">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Registration
            </dt>
            <dd>
              {regStatus === "open" && (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <IconCircleCheck className="size-3.5" />
                  Open
                </span>
              )}
              {regStatus === "upcoming" && (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <IconClock className="size-3.5" />
                  Upcoming
                </span>
              )}
              {regStatus === "closed" && (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  <IconCircleOff className="size-3.5" />
                  Closed
                </span>
              )}
              {!regStatus && (
                <span className="text-sm text-muted-foreground">N/A</span>
              )}
            </dd>
          </div>
        </dl>

        {/* Check-in link — OneTime only (MultiDay/Recurring check-in is per occurrence via Sessions/Days) */}
        {!isSeriesEvent && (
          <Button variant="outline" size="sm" onClick={() => copyLink(`/events/${event.id}/checkin`)}>
            <IconCopy className="mr-1.5 size-3.5" />
            Check-in link
          </Button>
        )}
      </div>

      {/* Filters — tight gap to metadata; reads as a toolbar, not a section */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground shrink-0">
            Period
          </span>
          <div className="flex flex-wrap items-center gap-0.5">
            {PERIODS.map((period) => (
              <Link
                key={period.value}
                href={withQuery({ period: period.value })}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  event.period === period.value
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {period.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground shrink-0">
            Role
          </span>
          <div className="flex flex-wrap items-center gap-0.5">
            {ROLE_FILTERS.map((filter) => (
              <Link
                key={filter.value}
                href={withQuery({ roleFilter: filter.value })}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  event.roleFilter === filter.value
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {filter.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* KPI cards — generous gap above signals a new data section */}
      <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border px-5 py-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
              {isSeriesEvent ? "Average Attendance" : "Total Attended"}
            </p>
            <span className="text-muted-foreground/40">
              <IconUsers className="size-4" />
            </span>
          </div>
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {formatAverage(event.averageAttendance)}
          </p>
          <p className="text-xs text-muted-foreground">
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
          <p className="text-xs text-muted-foreground">Distinct participants in selected period</p>
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
          <Link
            href={`/event/${event.id}/registrants`}
            className="text-3xl font-semibold tabular-nums tracking-tight text-foreground underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors w-fit"
          >
            {event.participantsWithoutSmallGroup.length.toLocaleString()}
          </Link>
          <p className="text-xs text-muted-foreground">Members and guests still unassigned</p>
        </div>

        <div className="rounded-lg border px-5 py-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground">
              Confirmed Volunteers
            </p>
            <span className="text-muted-foreground/40">
              <IconUsersGroup className="size-4" />
            </span>
          </div>
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {event.confirmedVolunteers.length.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">
            {totalVolunteers === 0
              ? "No volunteers yet"
              : totalVolunteers === event.confirmedVolunteers.length
                ? `All ${totalVolunteers} confirmed`
                : `of ${totalVolunteers} total${event.pendingVolunteerCount > 0 ? ` · ${event.pendingVolunteerCount} pending` : ""}${event.rejectedVolunteerCount > 0 ? ` · ${event.rejectedVolunteerCount} rejected` : ""}`}
          </p>
        </div>
      </div>

      {/* Attendance graph */}
      {isSeriesEvent && (
        <Card className="mt-6">
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
                  fill="var(--color-attendees)"
                  fillOpacity={0.1}
                  stroke="var(--color-attendees)"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Lower grid — asymmetric 8/4 split:
          main column: action-priority content (who needs assignment, volunteer ops)
          side column: pipeline wins (leaders identified, guests promoted) */}
      <div className="mt-8 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex flex-col gap-4 xl:col-span-8">
          <Card>
            <CardHeader>
              <CardTitle>Participants Without Small Group</CardTitle>
              <CardDescription>People who still need assignment</CardDescription>
            </CardHeader>
            <CardContent>
              {event.participantsWithoutSmallGroup.length === 0 ? (
                <p className="text-sm text-muted-foreground">Everyone is currently assigned.</p>
              ) : (
                <>
                  <div className="divide-y">
                    {event.participantsWithoutSmallGroup.slice(0, 20).map((person) => (
                      <div key={person.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                        <p className="text-sm font-medium">{person.name}</p>
                        <Badge variant="outline">{person.type}</Badge>
                      </div>
                    ))}
                  </div>
                  {event.participantsWithoutSmallGroup.length > 20 && (
                    <div className="flex items-center justify-between pt-3 mt-0.5 border-t">
                      <p className="text-xs text-muted-foreground">
                        Showing 20 of {event.participantsWithoutSmallGroup.length}
                      </p>
                      <Link
                        href={`/event/${event.id}/registrants`}
                        className="text-xs font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                      >
                        View all
                      </Link>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Volunteer Confirmation</CardTitle>
              <CardDescription>
                {event.confirmedVolunteers.length} confirmed
                {event.pendingVolunteerCount > 0 && ` · ${event.pendingVolunteerCount} pending`}
                {event.rejectedVolunteerCount > 0 && ` · ${event.rejectedVolunteerCount} rejected`}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">Confirmed</p>
                {event.confirmedVolunteers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No confirmed volunteers yet.</p>
                ) : (
                  <div className="divide-y">
                    {event.confirmedVolunteers.slice(0, 10).map((volunteer) => (
                      <div key={volunteer.id} className="py-2 first:pt-0 last:pb-0">
                        <p className="text-sm font-medium">{volunteer.name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-5">
                {pendingVolunteers.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">Pending</p>
                    <div className="divide-y">
                      {pendingVolunteers.slice(0, 5).map((volunteer) => (
                        <div key={volunteer.id} className="py-2 first:pt-0 last:pb-0">
                          <p className="text-sm font-medium">{volunteer.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {rejectedVolunteers.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">Rejected</p>
                    <div className="divide-y">
                      {rejectedVolunteers.slice(0, 5).map((volunteer) => (
                        <div key={volunteer.id} className="py-2 first:pt-0 last:pb-0">
                          <p className="text-sm font-medium">{volunteer.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {pendingVolunteers.length === 0 && rejectedVolunteers.length === 0 && (
                  <p className="text-sm text-muted-foreground">All volunteers are confirmed.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4 xl:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>New Small Group Leaders</CardTitle>
              <CardDescription>Leaders and Timothys identified in selected period</CardDescription>
            </CardHeader>
            <CardContent>
              {event.newLeaders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No new leaders in this period.</p>
              ) : (
                <div className="divide-y">
                  {event.newLeaders.map((leader) => (
                    <div key={leader.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{leader.name}</p>
                        <p className="text-xs text-muted-foreground">Updated {formatDate(leader.updatedAt)}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">{leader.groupStatus}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Guests Confirmed to Small Group</CardTitle>
              <CardDescription>Guests confirmed and joined a small group in this period</CardDescription>
            </CardHeader>
            <CardContent>
              {event.confirmedGuestsNowMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No confirmed guests matched this filter.</p>
              ) : (
                <div className="divide-y">
                  {event.confirmedGuestsNowMembers.map((guest) => (
                    <div key={guest.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{guest.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {guest.smallGroupName} · {formatDate(guest.resolvedAt)}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">{guest.memberStatus ?? "Member"}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  )
}
