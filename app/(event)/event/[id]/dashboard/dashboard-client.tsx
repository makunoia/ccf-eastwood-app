"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { EventSetupChecklist } from "@/components/event-setup-checklist"
import type { EventSetupChecklist as EventSetupChecklistData } from "@/lib/events/setup-checklist"
import {
  IconCopy,
  IconUserCheck,
  IconUserQuestion,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  LabelList,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

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
  averageAttendance: number
  uniqueAttendees: number
  attendanceSeries: Array<{
    date: string
    attendees: number
  }>
  registrationSeries: Array<{
    date: string
    total: number
  }>
  placement: {
    inGroup: number
    membersUnassigned: number
    guestsUnassigned: number
  }
  unassignedCount: number
  pipeline: {
    registered: number
    attended: number
    inSmallGroup: number
    newTimothys: number
    newLeaders: number
  }
  confirmedGuestsCount: number
  seriesSummaries: Array<{
    id: string
    title: string
    startDate: string
    endDate: string
    sessionCount: number
    totalAttendance: number
    averageAttendance: number
  }>
  confirmedVolunteerCount: number
  pendingVolunteerCount: number
  rejectedVolunteerCount: number
  brandBackground: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERIODS: Array<{ value: EventDashboardData["period"]; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
]

const attendanceChartConfig = {
  attendees: {
    label: "Attendance",
    color: "var(--primary)",
  },
} satisfies ChartConfig

const registrationChartConfig = {
  total: {
    label: "Registrations",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

const placementChartConfig = {
  inGroup: {
    label: "In a group",
    color: "var(--chart-2)",
  },
  membersUnassigned: {
    label: "Members unassigned",
    color: "var(--chart-4)",
  },
  guestsUnassigned: {
    label: "Guests unassigned",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

const volunteerChartConfig = {
  confirmed: {
    label: "Confirmed",
    color: "var(--chart-2)",
  },
  pending: {
    label: "Pending",
    color: "var(--chart-4)",
  },
  rejected: {
    label: "Rejected",
    color: "var(--chart-5)",
  },
} satisfies ChartConfig

const pipelineChartConfig = {
  value: {
    label: "People",
    color: "var(--primary)",
  },
} satisfies ChartConfig

const seriesChartConfig = {
  averageAttendance: {
    label: "Avg attendance",
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

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  })
}

function formatAverage(value: number) {
  if (Number.isInteger(value)) return value.toLocaleString()
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

function formatRange(startIso: string, endIso: string) {
  return `${formatDate(startIso)} – ${formatDate(endIso)}`
}

function DonutCenterLabel({
  viewBox,
  value,
  caption,
}: {
  viewBox?: unknown
  value: string
  caption: string
}) {
  if (!viewBox || typeof viewBox !== "object" || !("cx" in viewBox) || !("cy" in viewBox)) {
    return null
  }
  const { cx, cy } = viewBox as { cx: number; cy: number }
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
      <tspan x={cx} y={cy} className="fill-foreground text-2xl font-semibold tabular-nums">
        {value}
      </tspan>
      <tspan x={cx} y={cy + 20} className="fill-muted-foreground text-xs">
        {caption}
      </tspan>
    </text>
  )
}

function ChartEmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-45 items-center justify-center">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

const drillLinkClass =
  "text-xs font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"

// ─── Component ────────────────────────────────────────────────────────────────

export function EventDashboardClient({
  event,
  setup,
}: {
  event: EventDashboardData
  setup: EventSetupChecklistData | null
}) {
  const pathname = usePathname()

  const isRecurring = event.type === "Recurring"
  const isMultiDay = event.type === "MultiDay"
  const isSeriesEvent = isRecurring || isMultiDay

  const totalVolunteers =
    event.confirmedVolunteerCount + event.pendingVolunteerCount + event.rejectedVolunteerCount

  const placementTotal =
    event.placement.inGroup +
    event.placement.membersUnassigned +
    event.placement.guestsUnassigned
  const placementData = [
    { segment: "inGroup", count: event.placement.inGroup, fill: "var(--color-inGroup)" },
    {
      segment: "membersUnassigned",
      count: event.placement.membersUnassigned,
      fill: "var(--color-membersUnassigned)",
    },
    {
      segment: "guestsUnassigned",
      count: event.placement.guestsUnassigned,
      fill: "var(--color-guestsUnassigned)",
    },
  ].filter((slice) => slice.count > 0)
  const inGroupPercent =
    placementTotal > 0 ? Math.round((event.placement.inGroup / placementTotal) * 100) : 0

  const volunteerData = [
    { status: "confirmed", count: event.confirmedVolunteerCount, fill: "var(--color-confirmed)" },
    { status: "pending", count: event.pendingVolunteerCount, fill: "var(--color-pending)" },
    { status: "rejected", count: event.rejectedVolunteerCount, fill: "var(--color-rejected)" },
  ].filter((slice) => slice.count > 0)

  const pipelineData = [
    { stage: "Registered", value: event.pipeline.registered },
    { stage: "Attended", value: event.pipeline.attended },
    { stage: "In small group", value: event.pipeline.inSmallGroup },
    { stage: "New Timothy", value: event.pipeline.newTimothys },
    { stage: "New Leader", value: event.pipeline.newLeaders },
  ]

  function copyLink(path: string) {
    const url = `${window.location.origin}${path}`
    navigator.clipboard.writeText(url)
    toast.success("Link copied")
  }

  return (
    <div className="flex flex-1 flex-col p-6">
      {setup && (
        <div className="mb-6">
          <EventSetupChecklist eventId={event.id} checklist={setup} />
        </div>
      )}

      {/* Filters — reads as a toolbar, not a section */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-center gap-0.5">
          {PERIODS.map((period) => (
            <Link
              key={period.value}
              href={`${pathname}?period=${period.value}`}
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

        {/* Check-in link — OneTime only (MultiDay/Recurring check-in is per occurrence via Sessions/Days) */}
        {!isSeriesEvent && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => copyLink(`/events/${event.id}/checkin`)}
          >
            <IconCopy className="mr-1.5 size-3.5" />
            Check-in link
          </Button>
        )}
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
            {event.unassignedCount.toLocaleString()}
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
            {event.confirmedVolunteerCount.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">
            {totalVolunteers === 0
              ? "No volunteers yet"
              : totalVolunteers === event.confirmedVolunteerCount
                ? `All ${totalVolunteers} confirmed`
                : `of ${totalVolunteers} total${event.pendingVolunteerCount > 0 ? ` · ${event.pendingVolunteerCount} pending` : ""}${event.rejectedVolunteerCount > 0 ? ` · ${event.rejectedVolunteerCount} rejected` : ""}`}
          </p>
        </div>
      </div>

      {/* Trend row — attendance per session (series events) + cumulative registrations */}
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-12">
        {isSeriesEvent && (
          <Card className="xl:col-span-8">
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
                    tickFormatter={formatShortDate}
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

        <Card className={isSeriesEvent ? "xl:col-span-4" : "xl:col-span-12"}>
          <CardHeader>
            <CardTitle>Registration Growth</CardTitle>
            <CardDescription>Cumulative registrations in selected period</CardDescription>
          </CardHeader>
          <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
            {event.registrationSeries.length === 0 ? (
              <ChartEmptyState>No registrations yet in selected period.</ChartEmptyState>
            ) : (
              <ChartContainer config={registrationChartConfig} className="aspect-auto h-65 w-full">
                <AreaChart data={event.registrationSeries}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={28}
                    tickFormatter={formatShortDate}
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
                    dataKey="total"
                    type="monotone"
                    fill="var(--color-total)"
                    fillOpacity={0.1}
                    stroke="var(--color-total)"
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Breakdown row — placement, volunteers, pipeline */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Small Group Placement</CardTitle>
            <CardDescription>Participants assigned vs still unassigned</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {placementTotal === 0 ? (
              <ChartEmptyState>No participants yet.</ChartEmptyState>
            ) : (
              <ChartContainer
                config={placementChartConfig}
                className="mx-auto aspect-square max-h-55"
              >
                <PieChart>
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={placementData}
                    dataKey="count"
                    nameKey="segment"
                    innerRadius="55%"
                    outerRadius="85%"
                    strokeWidth={5}
                  >
                    <Label
                      content={({ viewBox }) => (
                        <DonutCenterLabel
                          viewBox={viewBox}
                          value={`${inGroupPercent}%`}
                          caption="in a group"
                        />
                      )}
                    />
                  </Pie>
                  <ChartLegend
                    content={<ChartLegendContent nameKey="segment" />}
                    className="flex-wrap gap-2"
                  />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
          {event.unassignedCount > 0 && (
            <CardFooter>
              <Link href={`/event/${event.id}/registrants`} className={drillLinkClass}>
                View {event.unassignedCount.toLocaleString()} unassigned →
              </Link>
            </CardFooter>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Volunteer Status</CardTitle>
            <CardDescription>Confirmation status across all volunteers</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {totalVolunteers === 0 ? (
              <ChartEmptyState>No volunteers yet.</ChartEmptyState>
            ) : (
              <ChartContainer
                config={volunteerChartConfig}
                className="mx-auto aspect-square max-h-55"
              >
                <PieChart>
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={volunteerData}
                    dataKey="count"
                    nameKey="status"
                    innerRadius="55%"
                    outerRadius="85%"
                    strokeWidth={5}
                  >
                    <Label
                      content={({ viewBox }) => (
                        <DonutCenterLabel
                          viewBox={viewBox}
                          value={totalVolunteers.toLocaleString()}
                          caption={totalVolunteers === 1 ? "volunteer" : "volunteers"}
                        />
                      )}
                    />
                  </Pie>
                  <ChartLegend
                    content={<ChartLegendContent nameKey="status" />}
                    className="flex-wrap gap-2"
                  />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
          <CardFooter>
            <Link href={`/event/${event.id}/volunteers`} className={drillLinkClass}>
              Manage volunteers →
            </Link>
          </CardFooter>
        </Card>

        <Card className="flex flex-col md:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardTitle>Discipleship Pipeline</CardTitle>
            <CardDescription>
              From registration to leadership — attendance and new roles use the selected period
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {event.pipeline.registered === 0 ? (
              <ChartEmptyState>No registrants yet.</ChartEmptyState>
            ) : (
              <ChartContainer config={pipelineChartConfig} className="aspect-auto h-55 w-full">
                <BarChart
                  data={pipelineData}
                  layout="vertical"
                  margin={{ left: 0, right: 32 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="stage"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    width={104}
                  />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={4}>
                    <LabelList
                      dataKey="value"
                      position="right"
                      className="fill-foreground"
                      fontSize={12}
                    />
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
          {event.confirmedGuestsCount > 0 && (
            <CardFooter>
              <p className="text-xs text-muted-foreground">
                {event.confirmedGuestsCount.toLocaleString()}{" "}
                {event.confirmedGuestsCount === 1 ? "guest" : "guests"} confirmed to a small group
                this period
              </p>
            </CardFooter>
          )}
        </Card>
      </div>

      {/* Series comparison — Recurring only */}
      {isRecurring && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Series Comparison</CardTitle>
            <CardDescription>
              {event.seriesSummaries.length > 0
                ? "Average attendance per recurring session group"
                : "No recurring series created yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {event.seriesSummaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Create a series from the Sessions page to start grouping recurring attendance.
              </p>
            ) : (
              <ChartContainer
                config={seriesChartConfig}
                className="aspect-auto w-full"
                style={{ height: Math.max(event.seriesSummaries.length * 48, 96) + 16 }}
              >
                <BarChart
                  data={event.seriesSummaries}
                  layout="vertical"
                  margin={{ left: 0, right: 40 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="title"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    width={140}
                    tickFormatter={(value: string) =>
                      value.length > 18 ? `${value.slice(0, 17)}…` : value
                    }
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        labelFormatter={(label, payload) => {
                          const item = payload?.[0]?.payload as
                            | EventDashboardData["seriesSummaries"][number]
                            | undefined
                          if (!item) return label
                          return (
                            <div className="flex flex-col gap-0.5">
                              <span>{label}</span>
                              <span className="font-normal text-muted-foreground">
                                {formatRange(item.startDate, item.endDate)} · {item.sessionCount}{" "}
                                {item.sessionCount === 1 ? "session" : "sessions"} ·{" "}
                                {item.totalAttendance.toLocaleString()} total
                              </span>
                            </div>
                          )
                        }}
                      />
                    }
                  />
                  <Bar dataKey="averageAttendance" fill="var(--color-averageAttendance)" radius={4}>
                    <LabelList
                      dataKey="averageAttendance"
                      position="right"
                      className="fill-foreground"
                      fontSize={12}
                      formatter={formatAverage}
                    />
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
