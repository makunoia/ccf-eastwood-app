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
  memberId: string | null
  guestId: string | null
  firstName: string
  lastName: string
  phone: string | null
  isMember: boolean
  checkedIn: boolean
  /** Registration arrived through the cluster's shared form. */
  viaCluster: boolean
  registeredAt: Date
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
