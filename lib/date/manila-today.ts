const MANILA_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** Today's calendar date in Manila as YYYY-MM-DD. */
export function manilaToday(now: Date = new Date()): string {
  return MANILA_DATE_FORMAT.format(now)
}
