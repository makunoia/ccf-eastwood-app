/**
 * Pre-registration → check-in turnout for an event — CCF-91.
 *
 * Answers "of the people on our list, how many actually showed up?".
 *
 * The denominator is every registrant of the event, not a period-filtered slice:
 * a registration made months ago still entitles that person to walk in today, so
 * narrowing it to the dashboard window would flatter the rate. The numerator is
 * the dashboard's period-bounded unique-attendee count, which is why the card
 * copy names the window explicitly.
 *
 * Because every attendee necessarily has an EventRegistrant row for the same
 * event, `checkedIn` can never exceed `preRegistered` — walk-ins land in both
 * sides of the ratio, so registering at the door reads as attendance, not as a
 * rate above 100%.
 *
 * The same shape also serves **per-session** turnout, where the numerator is one
 * occurrence's check-ins rather than the event's. That reuse carries one hard
 * condition: the numerator must count **participants only**. An
 * `OccurrenceAttendee` row holds either a `registrantId` or a `volunteerId`, and
 * a volunteer has no `EventRegistrant` — so a volunteer-inclusive numerator is
 * not a subset of the denominator and a well-staffed session reports above 100%.
 * See `lib/events/session-turnout.ts`, which is the only place that count is
 * derived, and `lib/events/series-summary.ts` on the same mismatch.
 *
 * A session's denominator is the whole series roster, matching the dashboard KPI
 * so the two screens can't disagree. On a long-running Recurring event that
 * roster only grows, so a session's rate decays over time and a past session's
 * rate shifts when someone registers months later. That is why every surface
 * prints its denominator inline (`formatTurnoutRatio`) instead of a bare percent
 * — the figure has to explain itself.
 */

export type EventTurnout = {
  /** Everyone holding a registration for this event. */
  preRegistered: number
  /** Distinct participants who checked in during the selected period. */
  checkedIn: number
  /** Registrants with no check-in in the period. */
  noShows: number
  /** `checkedIn / preRegistered` in the 0–1 range, or null when nobody registered. */
  rate: number | null
}

export function buildTurnout(preRegistered: number, checkedIn: number): EventTurnout {
  return {
    preRegistered,
    checkedIn,
    noShows: preRegistered - checkedIn,
    rate: preRegistered > 0 ? checkedIn / preRegistered : null,
  }
}

/** Whole-percent label for the KPI card. An event with no registrants has no rate to show. */
export function formatTurnoutRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`
}

/**
 * "71 of 230 registered" — the ratio spelled out.
 *
 * Every surface showing a turnout percentage pairs it with this, because the
 * denominator is the whole series roster and a bare "31%" invites the reader to
 * guess at what it divides by. It also names *registered* explicitly, which is
 * what keeps it legible beside a volunteer-inclusive check-in count on the
 * Sessions list: the two figures have different denominators, so each states its
 * own rather than implying they describe the same population.
 */
export function formatTurnoutRatio(turnout: EventTurnout): string {
  return `${turnout.checkedIn.toLocaleString()} of ${turnout.preRegistered.toLocaleString()} registered`
}
