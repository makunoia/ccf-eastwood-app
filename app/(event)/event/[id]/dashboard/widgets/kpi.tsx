"use client"

import Link from "next/link"
import {
  IconCalendarEvent,
  IconCash,
  IconChecks,
  IconClipboardList,
  IconTargetArrow,
  IconUserCheck,
  IconUserQuestion,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react"

import { StatCard } from "@/components/session-stat-card"
import { formatTurnoutRate } from "@/lib/events/turnout"
import {
  formatAverage,
  isSeriesEvent,
  periodPhrase,
  type WidgetProps,
} from "../shared"

/**
 * The KPI lane. Each tile is its own widget so the customizer can show, hide and
 * reorder them individually; they all render through the shared `StatCard`.
 */

export function KpiAttendance({ event }: WidgetProps) {
  const series = isSeriesEvent(event.type)
  return (
    <StatCard
      label={series ? "Average Attendance" : "Total Attended"}
      value={formatAverage(event.averageAttendance)}
      icon={<IconUsers className="size-4" />}
      caption={
        series
          ? "Average participant check-ins per session"
          : `Attendees checked in over ${periodPhrase(event.period)}`
      }
    />
  )
}

export function KpiUniqueAttendees({ event }: WidgetProps) {
  return (
    <StatCard
      label="Unique Attendees"
      value={event.uniqueAttendees.toLocaleString()}
      icon={<IconUserCheck className="size-4" />}
      caption="Distinct participants in selected period"
    />
  )
}

export function KpiTurnout({ event }: WidgetProps) {
  return (
    <StatCard
      label="Turnout"
      value={formatTurnoutRate(event.turnout.rate)}
      icon={<IconTargetArrow className="size-4" />}
      // The numerator is window-bounded, the denominator is the whole roster —
      // so the copy has to say which window, or "12 of 500" reads as a disaster
      // instead of as a filter.
      caption={
        event.turnout.preRegistered === 0
          ? "No registrations yet"
          : `${event.turnout.checkedIn.toLocaleString()} of ${event.turnout.preRegistered.toLocaleString()} registered checked in ${periodPhrase(event.period)} · ${event.turnout.noShows.toLocaleString()} ${event.period === "all" ? `no-show${event.turnout.noShows === 1 ? "" : "s"}` : "not in window"}`
      }
    />
  )
}

export function KpiUnassigned({ event }: WidgetProps) {
  return (
    <StatCard
      label="Not In DGroup Yet"
      value={
        <Link
          href={`/event/${event.id}/registrants`}
          className="underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
        >
          {event.unassignedCount.toLocaleString()}
        </Link>
      }
      icon={<IconUserQuestion className="size-4" />}
      caption="Members and guests still unassigned"
    />
  )
}

export function KpiVolunteers({ event }: WidgetProps) {
  const total =
    event.confirmedVolunteerCount + event.pendingVolunteerCount + event.rejectedVolunteerCount

  return (
    <StatCard
      label="Confirmed Volunteers"
      value={event.confirmedVolunteerCount.toLocaleString()}
      icon={<IconUsersGroup className="size-4" />}
      caption={
        total === 0
          ? "No volunteers yet"
          : total === event.confirmedVolunteerCount
            ? `All ${total} confirmed`
            : `of ${total} total${event.pendingVolunteerCount > 0 ? ` · ${event.pendingVolunteerCount} pending` : ""}${event.rejectedVolunteerCount > 0 ? ` · ${event.rejectedVolunteerCount} rejected` : ""}`
      }
    />
  )
}

export function KpiRegistered({ event }: WidgetProps) {
  return (
    <StatCard
      label="Total Registered"
      value={event.registrantCount.toLocaleString()}
      icon={<IconClipboardList className="size-4" />}
      // Deliberately not period-bounded: the roster is the roster, and it is the
      // denominator the Turnout tile beside it divides by.
      caption="Everyone on the roster, all time"
    />
  )
}

export function KpiPaid({ event }: WidgetProps) {
  const unpaid = event.registrantCount - event.paidCount
  return (
    <StatCard
      label="Paid"
      value={event.paidCount.toLocaleString()}
      icon={<IconCash className="size-4" />}
      caption={
        event.registrantCount === 0
          ? "No registrations yet"
          : `of ${event.registrantCount.toLocaleString()} registered · ${unpaid.toLocaleString()} unpaid`
      }
    />
  )
}

export function KpiSessions({ event }: WidgetProps) {
  return (
    <StatCard
      label="Sessions"
      value={event.occurrenceCount.toLocaleString()}
      icon={<IconCalendarEvent className="size-4" />}
      caption={
        event.sessionsInPeriod === event.occurrenceCount
          ? "Sessions created, all time"
          : `all time · ${event.sessionsInPeriod.toLocaleString()} in ${periodPhrase(event.period)}`
      }
    />
  )
}

export function KpiTotalCheckIns({ event }: WidgetProps) {
  return (
    <StatCard
      label="Total Check-ins"
      value={event.totalCheckIns.toLocaleString()}
      icon={<IconChecks className="size-4" />}
      // Counts a person once per session, unlike Unique Attendees — naming the
      // difference is the whole reason both tiles can be on at once.
      caption={`Participant check-ins in ${periodPhrase(event.period)}, counted per session`}
    />
  )
}
