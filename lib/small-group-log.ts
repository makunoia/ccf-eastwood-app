/**
 * Display helpers for SmallGroupLog entries.
 *
 * A log row's actor is either an admin User (dashboard writes) or a Member (the
 * public token flows — Catch Mech facilitators and small group leaders never log
 * in, so they have no User). Renderers show whichever is set.
 */

export type LogActorShape = {
  performedByUser?: { name: string | null } | null
  performedByMember?: { firstName: string; lastName: string } | null
}

/** Name to attribute a log entry to, or null when the actor is unknown. */
export function logActorName(entry: LogActorShape): string | null {
  if (entry.performedByUser?.name) return entry.performedByUser.name
  if (entry.performedByMember) {
    const name = `${entry.performedByMember.firstName} ${entry.performedByMember.lastName}`.trim()
    if (name) return name
  }
  return null
}
