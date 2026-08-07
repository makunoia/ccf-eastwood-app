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
