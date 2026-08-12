import type { ClusterCheckinShortcutStatus } from "./checkin-shortcuts"

/**
 * The cluster check-in kiosk's person shape — pure, so the collapse logic is
 * unit-testable without a database.
 *
 * The per-event kiosk finds one subject and checks it in. A cluster day is
 * several independent events, so the kiosk instead finds one *person* and shows
 * every event of the day beside them: registered, already checked in, not
 * registered, or closed. One tap then records the ones it can.
 *
 * Every person carries a cell for every event of the day, including ones they
 * aren't registered for — a staffer needs to see that someone is missing from an
 * event they meant to join, and that cell is what points them at the walk-in door.
 */

/** One event of the day, with the check-in target it resolved to. */
export type ClusterCheckinTarget = {
  eventId: string
  eventName: string
  /**
   * From `resolveClusterCheckinShortcut` — the same verdict the admin board's
   * Shortcuts badge shows. `"open"` is the only status that records anything.
   */
  status: ClusterCheckinShortcutStatus
  /** The session to record against; null means OneTime (`attendedAt`). */
  occurrenceId: string | null
}

export type ClusterCheckinSubject = {
  kind: "registrant" | "volunteer"
  id: string
}

/** A matched registrant or volunteer row, already reduced to what the kiosk needs. */
export type ClusterCheckinSubjectRow = {
  /** Identity across events: member:<id> | guest:<id> | anon:<...>. */
  key: string
  eventId: string
  subject: ClusterCheckinSubject
  alreadyCheckedIn: boolean
  firstName: string
  lastName: string
  nickname: string | null
  /** Masked phone/email, so same-name candidates are distinguishable on a public page. */
  contactHint: string | null
  isMember: boolean
}

export type ClusterCheckinEventCell = {
  eventId: string
  eventName: string
  /** Null when this person has no registration or volunteer record for the event. */
  subject: ClusterCheckinSubject | null
  alreadyCheckedIn: boolean
  status: ClusterCheckinShortcutStatus
}

export type ClusterCheckinPerson = {
  key: string
  name: string
  nickname: string | null
  contactHint: string | null
  isMember: boolean
  /** One cell per event of the day, in cluster order. */
  events: ClusterCheckinEventCell[]
}

/**
 * Collapse per-event subject rows into one person per identity, with a cell for
 * every event of the day.
 *
 * A volunteer row beats a registrant row for the same person on the same event:
 * serving is the canonical presence record, which is the same precedence
 * `resolveCheckinCandidates` applies on the per-event kiosk. Beyond that, a row
 * that is already checked in wins over one that isn't, so a duplicate sign-up
 * can't make the kiosk offer to check in someone it already recorded.
 */
export function buildClusterCheckinPeople(
  targets: ClusterCheckinTarget[],
  rows: ClusterCheckinSubjectRow[]
): ClusterCheckinPerson[] {
  // The key already fixes the identity — every row under it is the same Member,
  // the same Guest, or the same name+contact — so the first row supplies the
  // display fields and later rows only fill in their event's cell.
  const byKey = new Map<
    string,
    { row: ClusterCheckinSubjectRow; cells: Map<string, ClusterCheckinSubjectRow> }
  >()

  for (const row of rows) {
    let person = byKey.get(row.key)
    if (!person) {
      person = { row, cells: new Map() }
      byKey.set(row.key, person)
    }
    const existing = person.cells.get(row.eventId)
    if (!existing || beats(row, existing)) {
      person.cells.set(row.eventId, row)
    }
  }

  const people = [...byKey.values()].map(({ row, cells }) => ({
    key: row.key,
    name: `${row.firstName} ${row.lastName}`.trim(),
    nickname: row.nickname,
    contactHint: row.contactHint,
    isMember: row.isMember,
    events: targets.map((target): ClusterCheckinEventCell => {
      const cell = cells.get(target.eventId)
      return {
        eventId: target.eventId,
        eventName: target.eventName,
        subject: cell?.subject ?? null,
        alreadyCheckedIn: cell?.alreadyCheckedIn ?? false,
        status: target.status,
      }
    }),
  }))

  return people.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
}

function beats(candidate: ClusterCheckinSubjectRow, existing: ClusterCheckinSubjectRow): boolean {
  if (candidate.subject.kind !== existing.subject.kind) {
    return candidate.subject.kind === "volunteer"
  }
  return candidate.alreadyCheckedIn && !existing.alreadyCheckedIn
}

/** The cells a one-tap check-in will actually write. */
export function recordableCells(person: ClusterCheckinPerson): ClusterCheckinEventCell[] {
  return person.events.filter(
    (c) => c.status === "open" && c.subject !== null && !c.alreadyCheckedIn
  )
}

/** Why a cell was passed over, for the kiosk's review screen and the action's result. */
export type ClusterCheckinSkipReason =
  // "open" is excluded by construction: an open cell is recorded, not skipped.
  | Exclude<ClusterCheckinShortcutStatus, "open">
  | "notRegistered"
  | "already"

export function skipReasonFor(
  cell: ClusterCheckinEventCell
): ClusterCheckinSkipReason | null {
  if (cell.subject === null) return "notRegistered"
  if (cell.status !== "open") return cell.status
  if (cell.alreadyCheckedIn) return "already"
  return null
}

/**
 * Attendee-facing note for a cell the kiosk will pass over. Deliberately not
 * `clusterCheckinClosedHint`, which is written for a staffer looking at the
 * admin board: nobody at the door needs to know which switch is off, only that
 * this event isn't taking check-ins.
 */
export function clusterCheckinCellNote(reason: ClusterCheckinSkipReason): string {
  switch (reason) {
    case "notRegistered":
      return "Not registered"
    case "already":
      return "Already checked in"
    case "noSession":
      return "No session today"
    case "formClosed":
    case "sessionClosed":
      return "Check-in closed"
  }
}
