/**
 * Shared calendar-date formatting for admin tables.
 *
 * Event dates are stored as UTC midnight, so everything here formats in UTC —
 * reading them in local time shifts a Manila-dated day backwards.
 */

const DAY_OPTS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
}

/** "Aug 9, 2026" */
export function formatDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-PH", { ...DAY_OPTS, year: "numeric" })
}

function isSameUTCDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

/**
 * "Aug 9, 2026" for a single day, "Aug 9 – Aug 11, 2026" within one year,
 * "Dec 30, 2026 – Jan 2, 2027" across years. A OneTime event starts and ends on
 * the same day, so it collapses to a single date rather than a range.
 */
export function formatDateRange(start: string | Date, end: string | Date): string {
  const s = new Date(start)
  const e = new Date(end)
  if (isSameUTCDay(s, e)) return formatDate(s)
  if (s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${s.toLocaleDateString("en-PH", DAY_OPTS)} – ${formatDate(e)}`
  }
  return `${formatDate(s)} – ${formatDate(e)}`
}
