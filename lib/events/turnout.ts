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
