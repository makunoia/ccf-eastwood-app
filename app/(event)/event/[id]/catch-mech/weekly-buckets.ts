export type WeeklyBucket = {
  /** ISO date of the week's Monday, `YYYY-MM-DD`. Sortable — this is the bucket key. */
  weekStart: string
  /** Display label, e.g. "Jul 13". Never sort on this. */
  label: string
  count: number
}

/** Local-time `YYYY-MM-DD`. Deliberately not `toISOString()` — see buildWeeklyBuckets. */
function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Monday 00:00 local of the week containing `date`. */
export function startOfISOWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  // getDay(): 0=Sun..6=Sat → days since Monday
  const daysSinceMonday = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - daysSinceMonday)
  return d
}

/**
 * Bucket dates into the `weeks` ISO weeks ending at the week containing `now`.
 *
 * Two things this gets right that the previous implementation did not:
 *
 * 1. Buckets are keyed on the week's Monday as `YYYY-MM-DD`, which sorts correctly.
 *    The old code keyed on a display string ("Wk 29 · Jul 13") and sorted with
 *    localeCompare, so "Wk 10" sorted before "Wk 9" and the trailing slice kept the
 *    lexically-last weeks rather than the most recent ones. It also broke across
 *    year boundaries, since the week number restarts at 1.
 *
 * 2. The window is pre-seeded with zeros, so a quiet week renders as a real zero bar
 *    instead of vanishing and letting neighbouring weeks sit misleadingly adjacent.
 *
 * Dates are handled in local time throughout. Formatting a local-midnight Monday via
 * `toISOString()` would shift it to the previous day in any positive-offset zone
 * (in UTC+8, Mon 00:00 local is Sun 16:00Z), so keys are built with local getters.
 */
export function buildWeeklyBuckets(
  dates: Date[],
  now: Date = new Date(),
  weeks = 8
): WeeklyBucket[] {
  const buckets = new Map<string, WeeklyBucket>()

  const currentWeekStart = startOfISOWeek(now)
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(currentWeekStart)
    d.setDate(d.getDate() - i * 7)
    buckets.set(toLocalISODate(d), {
      weekStart: toLocalISODate(d),
      label: d.toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
      count: 0,
    })
  }

  for (const date of dates) {
    const key = toLocalISODate(startOfISOWeek(date))
    const bucket = buckets.get(key)
    // Outside the window — ignore rather than widen it.
    if (bucket) bucket.count++
  }

  return [...buckets.values()]
}
