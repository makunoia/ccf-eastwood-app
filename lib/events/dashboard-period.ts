/**
 * The event dashboard's rolling period window.
 *
 * Every occurrence date in the database is normalised to UTC midnight
 * (`ensureMultiDayOccurrences`, `normalizeUtcDate`), so a window whose bounds
 * carry a time-of-day silently drops whole sessions:
 *
 *   - an upper bound of "now" excludes today's session until 08:00 PH, because
 *     today at 00:00Z is still in the future while the check-in desk is open;
 *   - a lower bound of "now minus N days" excludes the oldest day in the range,
 *     since that day's 00:00Z sits before the current time-of-day.
 *
 * Both bounds are therefore snapped to UTC day boundaries. The upper bound is
 * the end of *today* rather than an unbounded future: sessions that have not
 * happened yet carry no attendance, and plotting them would read as a crash to
 * zero rather than as "not yet".
 */

export type PeriodFilter = "7d" | "30d" | "90d" | "all"

export const PERIOD_FILTERS: PeriodFilter[] = ["7d", "30d", "90d", "all"]

export const DEFAULT_PERIOD: PeriodFilter = "30d"

export function normalizePeriod(value: string | undefined): PeriodFilter {
  return PERIOD_FILTERS.includes(value as PeriodFilter) ? (value as PeriodFilter) : DEFAULT_PERIOD
}

export function startOfUtcDay(date: Date): Date {
  const start = new Date(date)
  start.setUTCHours(0, 0, 0, 0)
  return start
}

export function endOfUtcDay(date: Date): Date {
  const end = new Date(date)
  end.setUTCHours(23, 59, 59, 999)
  return end
}

const DAYS_BACK: Record<Exclude<PeriodFilter, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
}

export type DashboardPeriod = {
  /** Inclusive lower bound, snapped to the start of a UTC day. */
  start: Date
  /** Inclusive upper bound — the end of today (UTC). Never in the future. */
  end: Date
  /**
   * Date filter for occurrence queries. "All time" deliberately drops the lower
   * bound: a standalone session can be dated before `Event.startDate`, and
   * anchoring to the event start would hide it.
   */
  occurrenceRange: { gte?: Date; lte: Date }
}

export function buildDashboardPeriod(
  period: PeriodFilter,
  eventStart: Date,
  now: Date = new Date(),
): DashboardPeriod {
  const end = endOfUtcDay(now)

  if (period === "all") {
    return {
      start: startOfUtcDay(eventStart),
      end,
      occurrenceRange: { lte: end },
    }
  }

  // Today counts as one of the N days: "Last 7 days" is today plus the six
  // before it, not today plus seven. The extra day is not cosmetic — on a weekly
  // recurring event it pulls a second session into the 7-day window, which
  // doubles the session count and halves "avg per session".
  const start = startOfUtcDay(now)
  start.setUTCDate(start.getUTCDate() - (DAYS_BACK[period] - 1))

  return { start, end, occurrenceRange: { gte: start, lte: end } }
}

/**
 * Occurrence `where` clause for the dashboard's period window.
 *
 * The upper bound exists so a session that has not happened yet doesn't plot as
 * a crash to zero — sound, but only for sessions that drew nobody. A session
 * whose check-in desk was opened ahead of time already holds real attendance,
 * and dropping it made the dashboard contradict the Sessions page, which has no
 * upper bound at all: the same people appeared in the session's checked-in list
 * while "Attendance by Session" showed nothing.
 *
 * This is not an edge case in PH. Occurrence dates are UTC midnight, so a
 * session an admin dates with *today's Manila date* sits a day ahead of the UTC
 * day until 08:00 PH — every early-morning check-in window hit this.
 *
 * Future sessions are therefore included exactly when someone has checked in.
 * `attendees: { some: {} }` counts volunteer rows too: any real check-in makes
 * the session real, and the chart plots both series.
 */
export function occurrenceWindowWhere(range: DashboardPeriod["occurrenceRange"]) {
  return {
    OR: [{ date: range }, { date: { gt: range.lte }, attendees: { some: {} } }],
  }
}
