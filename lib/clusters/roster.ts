import type { EventType } from "@/app/generated/prisma/client"

/**
 * Pure roster-matrix builder for the cluster dashboard (CCF-132) — person ×
 * events for the day. No DB access so the de-duplication logic is unit-testable.
 */

export type ClusterRosterEvent = {
  id: string
  name: string
  type: EventType
}

export type ClusterRegistrantRow = {
  id: string
  eventId: string
  eventType: EventType
  memberId: string | null
  guestId: string | null
  firstName: string
  lastName: string
  phone: string | null
  isMember: boolean
  checkedIn: boolean
  /** The cluster link names an explicit session for this row's event. */
  hasLinkedSession: boolean
  /** The cluster whose shared link this registration came through, if any. */
  registrationClusterId: string | null
  registeredAt: Date
}

/** The day a cluster stands for. `date: null` means the cluster has no date. */
export type ClusterDayScope = {
  clusterId: string
  date: Date | null
}

/**
 * Does this registration belong to the cluster's day?
 *
 * A cluster is one day. A OneTime event's registrations are inherently that
 * day's, so they all count. A Recurring or MultiDay event is different: its
 * `EventRegistrant` is one row per person per *series*, so counting them all
 * would put every person who ever registered for the weekly service on every
 * day the service appears — a figure that also grows retroactively as new
 * people register months later.
 *
 * For those events the day's population is the people we have evidence for:
 * they checked in (a session-scoped fact — the linked session when the cluster
 * names one, the day's occurrence otherwise), or they signed up for this
 * specific day through its shared link (`registrationClusterId`), which is a
 * statement of intent for that day whenever it was made.
 *
 * A cluster with no date has no day to scope to, so everything counts — unless
 * the link names a session explicitly, which is a scope of its own regardless
 * of the cluster having a date.
 */
export function isOnClusterDay(
  row: Pick<
    ClusterRegistrantRow,
    "eventType" | "checkedIn" | "registrationClusterId" | "hasLinkedSession"
  >,
  scope: ClusterDayScope | null
): boolean {
  if (row.eventType === "OneTime") return true
  if (!scope) return true
  if (!scope.date && !row.hasLinkedSession) return true
  return row.checkedIn || row.registrationClusterId === scope.clusterId
}

export type ClusterRosterCell = {
  registrantId: string
  checkedIn: boolean
}

export type ClusterRosterPerson = {
  /** Stable identity: member:<id> | guest:<id> | registrant:<id> (anonymous). */
  key: string
  firstName: string
  lastName: string
  phone: string | null
  isMember: boolean
  perEvent: Record<string, ClusterRosterCell | undefined>
}

export type ClusterRoster = {
  rows: ClusterRosterPerson[]
  events: ClusterRosterEvent[]
}

export function personKeyFor(row: {
  id: string
  memberId: string | null
  guestId: string | null
}): string {
  if (row.memberId) return `member:${row.memberId}`
  if (row.guestId) return `guest:${row.guestId}`
  return `registrant:${row.id}`
}

/**
 * Collapse per-event registrant rows into one row per person. The same person
 * (same member or guest) registered for several of the day's events becomes a
 * single roster row with one cell per event.
 */
export function buildClusterRoster(
  events: ClusterRosterEvent[],
  rows: ClusterRegistrantRow[]
): ClusterRoster {
  const byPerson = new Map<string, ClusterRosterPerson>()

  for (const row of rows) {
    const key = personKeyFor(row)
    let person = byPerson.get(key)
    if (!person) {
      person = {
        key,
        firstName: row.firstName,
        lastName: row.lastName,
        phone: row.phone,
        isMember: row.isMember,
        perEvent: {},
      }
      byPerson.set(key, person)
    }
    person.perEvent[row.eventId] = { registrantId: row.id, checkedIn: row.checkedIn }
  }

  const rosterRows = [...byPerson.values()].sort((a, b) => {
    const lastCmp = a.lastName.localeCompare(b.lastName, undefined, { sensitivity: "base" })
    if (lastCmp !== 0) return lastCmp
    return a.firstName.localeCompare(b.firstName, undefined, { sensitivity: "base" })
  })

  return { rows: rosterRows, events }
}
