"use client"

import type { ChartConfig } from "@/components/ui/chart"
import type { AttendanceSeriesPoint } from "@/lib/events/attendance-series"
import type { EventTurnout } from "@/lib/events/turnout"

/**
 * The dashboard payload and everything the widgets render it with.
 *
 * Split out of `dashboard-client.tsx` when the layout became configurable: each
 * widget is now its own component in `widgets/`, and they all need the same type,
 * chart configs and formatters.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type AttendanceBreakdownRow = {
  lifeStageId: string | null
  lifeStageName: string
  attendees: number
  firstTimers: number
  members: number
  membersInGroup: number
  membersNotInGroup: number
}

export type DashboardPeriod = "7d" | "30d" | "90d" | "all"

export type EventDashboardData = {
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
  allMinistries: boolean
  modules: string[]
  registrantCount: number
  paidCount: number
  attendedCount: number
  occurrenceCount: number
  totalCheckIns: number
  totalVolunteerCheckIns: number
  sessionsInPeriod: number
  period: DashboardPeriod
  averageAttendance: number
  uniqueAttendees: number
  turnout: EventTurnout
  attendanceSeries: AttendanceSeriesPoint[]
  registrationSeries: Array<{
    date: string
    total: number
  }>
  attendanceBreakdown: {
    rows: AttendanceBreakdownRow[]
    total: AttendanceBreakdownRow
  }
  /** No form collects Life Stage, and attendees landed in "Not specified" because of it. */
  explainMissingLifeStage: boolean
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
    /** Sessions assigned to the series, held or upcoming. */
    sessionCount: number
    /** Sessions already held — the denominator behind `averageAttendance`. */
    heldSessionCount: number
    /** Participant check-ins only, like every other attendance figure here. */
    totalAttendance: number
    volunteerAttendance: number
    /** Participants + volunteers; reconciles with the Sessions page. */
    totalCheckIns: number
    averageAttendance: number
  }>
  confirmedVolunteerCount: number
  pendingVolunteerCount: number
  rejectedVolunteerCount: number
  brandBackground: string | null
}

/** Every widget takes the whole payload — they each pick what they need from it. */
export type WidgetProps = { event: EventDashboardData }

// ─── Period ───────────────────────────────────────────────────────────────────

// All time leads: it's the default, and the row reads as "everything, then
// narrower and narrower" rather than burying the widest view at the end.
export const PERIODS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: "all", label: "All time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
]

/**
 * Every attendance figure on this page is bounded by the selected window, so any
 * copy that quotes one has to name the window too — otherwise a 7-day view of an
 * event that ran last month reads as a total collapse rather than as a filter.
 */
export function periodPhrase(period: DashboardPeriod) {
  return period === "all" ? "all time" : `the last ${period.replace("d", "")} days`
}

// ─── Chart configs ────────────────────────────────────────────────────────────

export const attendanceChartConfig = {
  attendees: {
    label: "Participants",
    color: "var(--primary)",
  },
  volunteers: {
    label: "Volunteers",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig

export const registrationChartConfig = {
  total: {
    label: "Registrations",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export const placementChartConfig = {
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

export const volunteerChartConfig = {
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

export const pipelineChartConfig = {
  value: {
    label: "People",
    color: "var(--primary)",
  },
} satisfies ChartConfig

export const lifeStageChartConfig = {
  firstTimers: {
    label: "First-timers",
    color: "var(--chart-1)",
  },
  membersNotInGroup: {
    label: "Members, no DGroup",
    color: "var(--chart-4)",
  },
  membersInGroup: {
    label: "Members in a DGroup",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export const seriesChartConfig = {
  averageAttendance: {
    label: "Avg attendance",
    color: "var(--primary)",
  },
} satisfies ChartConfig

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
}

export function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  })
}

export function formatAverage(value: number) {
  if (Number.isInteger(value)) return value.toLocaleString()
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

export function formatRange(startIso: string, endIso: string) {
  return `${formatDate(startIso)} – ${formatDate(endIso)}`
}

export function formatTooltipDate(value: string | number) {
  return new Date(value).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ─── Shared bits of chrome ────────────────────────────────────────────────────

export function DonutCenterLabel({
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

export function ChartEmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-45 items-center justify-center">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

export const drillLinkClass =
  "text-xs font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"

export function isSeriesEvent(type: EventDashboardData["type"]) {
  return type === "MultiDay" || type === "Recurring"
}
