/**
 * Which ministry an event stands for on a Collab day.
 *
 * A Collab asks "which ministry are you part of?" and routes the answer to one
 * member event, so every surface that renders the question — the registration
 * form, the volunteer form, and cluster Settings, which warns when the question
 * has no answer — needs the same rule for turning an event into a ministry. It
 * was written out at each of them, which is three places to keep in step and
 * three chances for the public form and the Settings warning to disagree about
 * whether a day is answerable.
 *
 * Pure and client-safe: no Prisma import, generic over the ministry shape, so a
 * caller that selected only `name` and one that selected `{ id, name }` both fit.
 */

export type MinistryBearingEvent<M> = {
  allMinistries: boolean
  ministries: { ministry: M }[]
}

/**
 * The one ministry behind this event, or `null` when the question is
 * unanswerable — no ministry, several, or `allMinistries`. That null is what
 * `collabMinistryProblems` reports on, so the rule lives here rather than being
 * re-derived beside each warning.
 */
export function clusterEventMinistry<M>(event: MinistryBearingEvent<M>): M | null {
  if (event.allMinistries) return null
  return event.ministries.length === 1 ? event.ministries[0].ministry : null
}

/**
 * A label for the event on a day form: its ministry's name, falling back to the
 * event's own.
 *
 * The fallback is deliberate and matches the registration form's. A day that
 * slipped past the collab ministry check still has to be fillable — labelling a
 * choice by the event name asks a stranger question than "which ministry are you
 * part of?" but it is a question, where an unlabelled option is a dead end.
 */
export function clusterEventMinistryLabel(
  event: MinistryBearingEvent<{ name: string }> & { name: string }
): string {
  return clusterEventMinistry(event)?.name ?? event.name
}
