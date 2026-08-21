type SeriesRange = {
  id: string
  title: string
  startDate: Date
  endDate: Date
}

type OccurrenceWithAttendance = {
  id: string
  date: Date
  isOpen: boolean
  isStandalone: boolean
  attendeeCount: number
  seriesId: string | null
  /**
   * Check-ins by people holding a registration — the turnout numerator. Carried
   * alongside `attendeeCount` rather than replacing it because the two answer
   * different questions: `attendeeCount` is every check-in, volunteers included,
   * while a turnout ratio divides by the registered roster, which volunteers are
   * absent from. See `lib/events/session-turnout.ts`.
   */
  participantCount?: number
  /**
   * Whether this session has *any* check-in row, volunteers included. Defaults to
   * `attendeeCount > 0`, which is right for callers whose count already covers
   * every check-in; a caller counting participants only must pass it explicitly,
   * or a future session staffed by volunteers alone reads as "not held yet".
   */
  hasCheckIns?: boolean
}

export type GroupedOccurrenceSeries = {
  id: string
  title: string
  startDate: string
  endDate: string
  /** Every session assigned to the series, held or still upcoming. */
  sessionCount: number
  /** Sessions that have actually happened — the denominator behind the average. */
  heldSessionCount: number
  totalAttendance: number
  averageAttendance: number
  occurrences: EmittedOccurrence[]
}

export type EmittedOccurrence = {
  id: string
  date: string
  isOpen: boolean
  attendeeCount: number
  /** Registered check-ins only — see {@link OccurrenceWithAttendance.participantCount}. */
  participantCount: number
  isStandalone: boolean
  seriesId: string | null
}

/**
 * The wire shape one occurrence goes out in. Shared by the grouped and ungrouped
 * arms so a field added to one can't go missing from the other.
 */
function emitOccurrence(occurrence: OccurrenceWithAttendance): EmittedOccurrence {
  return {
    id: occurrence.id,
    date: occurrence.date.toISOString(),
    isOpen: occurrence.isOpen,
    attendeeCount: occurrence.attendeeCount,
    participantCount: occurrence.participantCount ?? occurrence.attendeeCount,
    isStandalone: occurrence.isStandalone,
    seriesId: occurrence.seriesId,
  }
}

export function normalizeUtcDate(date: Date | string): Date {
  if (typeof date === "string") {
    return new Date(`${date}T00:00:00.000Z`)
  }

  const normalized = new Date(date)
  normalized.setUTCHours(0, 0, 0, 0)
  return normalized
}

export function seriesContainsDate(range: Pick<SeriesRange, "startDate" | "endDate">, date: Date) {
  return date >= range.startDate && date <= range.endDate
}

export function rangesOverlap(
  left: Pick<SeriesRange, "startDate" | "endDate">,
  right: Pick<SeriesRange, "startDate" | "endDate">,
) {
  return left.startDate <= right.endDate && right.startDate <= left.endDate
}

export function findMatchingSeries(
  ranges: SeriesRange[],
  date: Date,
): SeriesRange | null {
  return ranges.find((range) => seriesContainsDate(range, date)) ?? null
}

/**
 * Has this session happened yet?
 *
 * Occurrence dates are UTC midnight, so the comparison is day-to-day: anything
 * dated today or earlier has been held. A future-dated session counts as held
 * the moment someone checks in — an admin dating a session with today's *Manila*
 * date puts it a UTC day ahead until 08:00 PH, and that session's attendance is
 * real. See lib/events/dashboard-period.ts, which draws the same line.
 */
function isHeld(occurrence: OccurrenceWithAttendance, today: Date): boolean {
  const hasCheckIns = occurrence.hasCheckIns ?? occurrence.attendeeCount > 0
  return hasCheckIns || normalizeUtcDate(occurrence.date) <= today
}

/**
 * @param now Reference point for "held" — injectable so tests don't depend on
 *   the wall clock.
 */
export function groupOccurrencesBySeries(
  ranges: SeriesRange[],
  occurrences: OccurrenceWithAttendance[],
  now: Date = new Date(),
) {
  const today = normalizeUtcDate(now)
  const occurrencesBySeriesId = new Map<string, OccurrenceWithAttendance[]>()
  const ungrouped: OccurrenceWithAttendance[] = []

  for (const occurrence of occurrences) {
    if (occurrence.seriesId) {
      const existing = occurrencesBySeriesId.get(occurrence.seriesId) ?? []
      existing.push(occurrence)
      occurrencesBySeriesId.set(occurrence.seriesId, existing)
      continue
    }

    ungrouped.push(occurrence)
  }

  const groups: GroupedOccurrenceSeries[] = ranges.map((range) => {
    const groupOccurrences = (occurrencesBySeriesId.get(range.id) ?? []).sort(
      (left, right) => right.date.getTime() - left.date.getTime(),
    )
    const totalAttendance = groupOccurrences.reduce(
      (sum, occurrence) => sum + occurrence.attendeeCount,
      0,
    )
    // Sessions still to come carry no attendance and must stay out of the
    // denominator: a 12-week series four weeks in was reporting a third of its
    // real average, and disagreed with the dashboard's own "avg per session"
    // KPI, which has always excluded them.
    const heldSessionCount = groupOccurrences.filter((occurrence) =>
      isHeld(occurrence, today),
    ).length

    return {
      id: range.id,
      title: range.title,
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString(),
      sessionCount: groupOccurrences.length,
      heldSessionCount,
      totalAttendance,
      averageAttendance: heldSessionCount > 0 ? totalAttendance / heldSessionCount : 0,
      occurrences: groupOccurrences.map(emitOccurrence),
    }
  })

  const sortedUngrouped = ungrouped.sort(
    (left, right) => right.date.getTime() - left.date.getTime(),
  )

  return {
    groups,
    ungrouped: sortedUngrouped.map(emitOccurrence),
  }
}
