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
  /**
   * This registration belongs to the cluster's day — see {@link isOnClusterDay}.
   *
   * Carried rather than filtered on. A registration that misses the day is still
   * a registration, and a roster that silently drops it renders the person as
   * "not registered" — which is a lie an admin can neither see through nor undo,
   * because the add-registrant screen correctly refuses to create the row twice.
   * Counts read this flag; the roster shows the row either way.
   */
  onClusterDay: boolean
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
 *
 * The third piece of evidence is the registration's own timestamp. Only the
 * cluster's shared form ever stamps `registrationClusterId`, so someone who
 * signed up on the day itself through an individual event's link had no way to
 * carry the stamp — and if they hadn't reached the kiosk yet, nothing spoke for
 * them at all. When they signed up is a fact we already hold, and a sign-up made
 * on the day is as much a statement of intent for it as one made through the day
 * link. Unlike counting the whole series it cannot grow later: the timestamp is
 * fixed, so a day's figures never move on their own.
 */
export function isOnClusterDay(
  row: Pick<
    ClusterRegistrantRow,
    | "eventType"
    | "checkedIn"
    | "registrationClusterId"
    | "hasLinkedSession"
    | "registeredAt"
  >,
  scope: ClusterDayScope | null
): boolean {
  if (row.eventType === "OneTime") return true
  if (!scope) return true
  if (!scope.date && !row.hasLinkedSession) return true
  if (row.checkedIn) return true
  if (row.registrationClusterId === scope.clusterId) return true
  return scope.date ? registeredOnClusterDay(row.registeredAt, scope.date) : false
}

/** Manila runs UTC+8 all year — no DST to track. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Did this registration happen on the cluster's day, read in Manila time?
 *
 * A cluster's date is stored as UTC midnight standing for a bare day, while
 * `registeredAt` is a true instant. Comparing the two in raw UTC would put the
 * window eight hours early and miss anyone who registered between midnight and
 * 8am Manila on the day itself — the same seam that makes a session dated with
 * today's Manila date sit a UTC day ahead until 08:00.
 */
export function registeredOnClusterDay(registeredAt: Date, date: Date): boolean {
  const start =
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
    MANILA_OFFSET_MS
  const at = registeredAt.getTime()
  return at >= start && at < start + DAY_MS
}

export type ClusterRosterCell = {
  registrantId: string
  checkedIn: boolean
  /** The registration counts toward the cluster's day. */
  onClusterDay: boolean
}

/**
 * How a person stands on one of the day's events. Three states, because
 * "registered for the series but not evidenced here" is its own answer — it is
 * neither presence nor absence, and rendering it as either one misinforms.
 */
export type ClusterStanding = "CheckedIn" | "OnDay" | "SeriesOnly"

export function standingFor(cell: ClusterRosterCell): ClusterStanding {
  if (cell.checkedIn) return "CheckedIn"
  return cell.onClusterDay ? "OnDay" : "SeriesOnly"
}

/** Rank for collapsing duplicate registrations: arriving beats intending. */
const STANDING_RANK: Record<ClusterStanding, number> = {
  CheckedIn: 2,
  OnDay: 1,
  SeriesOnly: 0,
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
    const cell: ClusterRosterCell = {
      registrantId: row.id,
      checkedIn: row.checkedIn,
      onClusterDay: row.onClusterDay,
    }
    // A person can hold two registrations on the SAME event (a duplicate
    // sign-up). Keep the one that says the most — the same rule the CSV export
    // folds by, so the two surfaces can't disagree about where someone stood.
    const held = person.perEvent[row.eventId]
    if (!held || STANDING_RANK[standingFor(cell)] > STANDING_RANK[standingFor(held)]) {
      person.perEvent[row.eventId] = cell
    }
  }

  const rosterRows = [...byPerson.values()].sort((a, b) => {
    const lastCmp = a.lastName.localeCompare(b.lastName, undefined, { sensitivity: "base" })
    if (lastCmp !== 0) return lastCmp
    return a.firstName.localeCompare(b.firstName, undefined, { sensitivity: "base" })
  })

  return { rows: rosterRows, events }
}
