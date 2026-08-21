/**
 * When a session's check-in kiosk will actually admit anyone.
 *
 * The kiosk at `/events/[id]/checkin/[occurrenceId]` refuses every visitor with
 * "Check-in not available" unless the session is open, or today *is* the
 * session's date. That rule lived only inside the kiosk page, so the Sessions
 * list offered a "Check-in page" button on every row — and on most of them it
 * led straight to the refusal. A link that doesn't lead anywhere is worse than
 * no link: it costs a row's worth of space to teach nothing.
 *
 * Both sides read this now. If the gate moves, the button moves with it.
 *
 * Occurrence dates are stored at UTC midnight, so the comparison is on UTC days
 * — the same basis the gate has always used. `today` is resolved by the caller
 * (on the server, for the list) rather than read from the clock here, so the
 * list renders the same day on both sides of hydration.
 */
export function utcDayOf(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10)
}

/** Today as a UTC day key, for passing into `isCheckinLive`. */
export function utcToday(now: Date = new Date()): string {
  return utcDayOf(now)
}

export function isCheckinLive({
  isOpen,
  date,
  today,
}: {
  isOpen: boolean
  date: Date | string
  today: string
}): boolean {
  return isOpen || utcDayOf(date) === today
}
