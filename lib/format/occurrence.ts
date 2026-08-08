/**
 * Session (EventOccurrence) date formatting.
 *
 * Occurrence dates are stored at UTC midnight, so they must be rendered in UTC.
 * Formatting one in the viewer's local zone shifts a Manila-morning session onto
 * the previous day — the label would disagree with the date the row was created
 * under, and with every other surface that gets this right.
 */

/** "Sun, Aug 9, 2026" — the label the Sessions list uses. */
export function formatOccurrenceDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** "1 session" / "4 sessions" — series summary chip. */
export function formatSessionCount(count: number): string {
  return `${count} ${count === 1 ? "session" : "sessions"}`
}

/** "1 person checked in" / "12 people checked in" — per-session attendance. */
export function formatAttendanceCount(count: number): string {
  if (count === 0) return "No one checked in yet"
  return `${count} ${count === 1 ? "person" : "people"} checked in`
}

/** "Avg 12/session" — rounded to one decimal, trailing ".0" dropped. */
export function formatAverageAttendance(value: number): string {
  const label = Number.isInteger(value)
    ? String(value)
    : value.toLocaleString("en-PH", { maximumFractionDigits: 1 })
  return `Avg ${label}/session`
}
