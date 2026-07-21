/**
 * Shared day/time formatting for schedule display.
 *
 * The codebase grew several near-identical copies of this (small-group detail
 * sheet, breakout detail, /me portal, public registration…). This is the
 * canonical one; migrate call sites to it opportunistically. Two output styles
 * exist on purpose — abbreviated ("Sun") for dense tables, pluralised
 * ("Sundays") for public-facing recurring-event copy.
 *
 * NOTE: `lib/csv-export.ts` (`formatDayOfWeek`) and `lib/assistant/serializers.ts`
 * (`dayLabel`) keep their own copies — both have tests pinning exact output, so
 * they are intentionally left untouched here.
 */

const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export type DayStyle = "long" | "short" | "plural"

/** 0 = Sunday … 6 = Saturday. Returns "" for an out-of-range index. */
export function formatDayOfWeek(day: number, style: DayStyle = "long"): string {
  if (!Number.isInteger(day) || day < 0 || day > 6) return ""
  if (style === "short") return DAY_SHORT[day]
  if (style === "plural") return `${DAY_LONG[day]}s`
  return DAY_LONG[day]
}

/** "HH:MM" (24h) → "7:30 PM". Returns "" for a malformed value. */
export function formatTime(hhmm: string | null | undefined): string {
  if (!hhmm) return ""
  const [hStr, mStr] = hhmm.split(":")
  const h = Number(hStr)
  const m = Number(mStr)
  if (Number.isNaN(h) || Number.isNaN(m)) return ""
  const period = h < 12 ? "AM" : "PM"
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, "0")} ${period}`
}

/**
 * Full slot, e.g. "Sunday · 7:30 PM – 9:00 PM" (or "Sunday · 7:30 PM" when
 * there's no end time). Returns "" when the day is out of range.
 */
export function formatSchedule(
  day: number,
  timeStart: string | null | undefined,
  timeEnd?: string | null,
  style: DayStyle = "long"
): string {
  const dayLabel = formatDayOfWeek(day, style)
  if (!dayLabel) return ""
  const start = formatTime(timeStart)
  if (!start) return dayLabel
  const end = formatTime(timeEnd)
  return `${dayLabel} · ${end ? `${start} – ${end}` : start}`
}
