/**
 * The attendance pill on a person's Events tab (member + guest detail pages).
 *
 * `EventRegistrant.attendedAt` is a OneTime-only field — MultiDay and Recurring
 * events record attendance per occurrence via `OccurrenceAttendee`. Reading only
 * `attendedAt` therefore labelled every MultiDay/Recurring registration "Absent",
 * including people who checked in to every single session.
 *
 * The other half of the inaccuracy is time: an event that hasn't happened yet
 * can't have been missed. A registration for a future event is "Registered", not
 * "Absent".
 *
 * See loadEventAttendanceBreakdown in lib/events/attendance-breakdown.ts, which
 * applies the same OneTime-vs-occurrence split on the dashboard.
 */

import { plural } from "@/lib/format/plural"

export type RegistrationAttendanceTone = "attended" | "absent" | "pending"

export type RegistrationAttendance = {
  label: string
  tone: RegistrationAttendanceTone
}

export type RegistrationAttendanceInput = {
  eventType: "OneTime" | "MultiDay" | "Recurring"
  /** `Event.endDate` — stored at UTC midnight. */
  endDate: Date
  /** OneTime attendance stamp. Always null on MultiDay/Recurring. */
  attendedAt: Date | null
  /** How many occurrences this registrant checked in to. */
  attendedCount: number
  /** Total occurrences on the event. Only meaningful for MultiDay. */
  occurrenceCount: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Event dates are UTC midnight, so a same-day event would read as "over" from
 * 08:00 Manila onward if compared directly. Give the last day its full 24h
 * before calling anyone absent.
 */
function hasConcluded(endDate: Date, now: Date): boolean {
  return now.getTime() >= endDate.getTime() + DAY_MS
}

export function resolveRegistrationAttendance(
  input: RegistrationAttendanceInput,
  now: Date = new Date(),
): RegistrationAttendance {
  const { eventType, endDate, attendedAt, attendedCount, occurrenceCount } = input

  if (eventType === "OneTime") {
    if (attendedAt) return { label: "Attended", tone: "attended" }
    return hasConcluded(endDate, now)
      ? { label: "Absent", tone: "absent" }
      : { label: "Registered", tone: "pending" }
  }

  if (eventType === "MultiDay") {
    if (attendedCount > 0) {
      // Never render "6 of 5": standalone sessions can sit outside the day range.
      const total = Math.max(occurrenceCount, attendedCount)
      return {
        label: total > 0 ? `${attendedCount} of ${total} days` : plural(attendedCount, "day"),
        tone: "attended",
      }
    }
    return hasConcluded(endDate, now)
      ? { label: "Absent", tone: "absent" }
      : { label: "Registered", tone: "pending" }
  }

  // Recurring: registration is one-off and the run is open-ended, so there is no
  // single occasion to have been absent from — only a check-in count.
  if (attendedCount > 0) {
    return { label: plural(attendedCount, "session"), tone: "attended" }
  }
  return { label: "No check-ins", tone: "pending" }
}
