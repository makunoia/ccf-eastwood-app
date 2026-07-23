/**
 * The public registration window derived from an event's "Opens"/"Closes" dates.
 *
 * A null bound means that side is unbounded (no open date = always been open; no
 * close date = never closes). Both null = permanently within the window. This is
 * the shared source of truth for the public register page's gate and the
 * `createRegistrant` server guard, so the two can never disagree.
 */
export function isWithinRegistrationWindow(
  registrationStart: Date | null | undefined,
  registrationEnd: Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (registrationStart && now < registrationStart) return false
  if (registrationEnd && now > registrationEnd) return false
  return true
}
