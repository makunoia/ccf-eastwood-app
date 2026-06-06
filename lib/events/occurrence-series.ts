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
}

export type GroupedOccurrenceSeries = {
  id: string
  title: string
  startDate: string
  endDate: string
  sessionCount: number
  totalAttendance: number
  averageAttendance: number
  occurrences: Array<{
    id: string
    date: string
    isOpen: boolean
    attendeeCount: number
    isStandalone: boolean
    seriesId: string | null
  }>
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

export function groupOccurrencesBySeries(
  ranges: SeriesRange[],
  occurrences: OccurrenceWithAttendance[],
) {
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

    return {
      id: range.id,
      title: range.title,
      startDate: range.startDate.toISOString(),
      endDate: range.endDate.toISOString(),
      sessionCount: groupOccurrences.length,
      totalAttendance,
      averageAttendance:
        groupOccurrences.length > 0 ? totalAttendance / groupOccurrences.length : 0,
      occurrences: groupOccurrences.map((occurrence) => ({
        id: occurrence.id,
        date: occurrence.date.toISOString(),
        isOpen: occurrence.isOpen,
        attendeeCount: occurrence.attendeeCount,
        isStandalone: occurrence.isStandalone,
        seriesId: occurrence.seriesId,
      })),
    }
  })

  const sortedUngrouped = ungrouped.sort(
    (left, right) => right.date.getTime() - left.date.getTime(),
  )

  return {
    groups,
    ungrouped: sortedUngrouped.map((occurrence) => ({
      id: occurrence.id,
      date: occurrence.date.toISOString(),
      isOpen: occurrence.isOpen,
      attendeeCount: occurrence.attendeeCount,
      isStandalone: occurrence.isStandalone,
      seriesId: occurrence.seriesId,
    })),
  }
}
