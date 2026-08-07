import { compareByRoom, type BreakoutOccupancy } from "@/lib/breakouts/occupancy"

export type SessionAttendeeView = {
  name: string | null
  isReturner: boolean
  breakoutGroupNames: string[]
}

export type AttendeeSortDirection = "asc" | "desc"

export type AttendeeStatusSubject = {
  kind: "registrant" | "volunteer"
  isMember: boolean
  isVolunteer: boolean
  /** Whether an admin has pinned this row's New/Returning status. */
  hasStatusOverride: boolean
}

/**
 * Whether the New/Returning badge on a session attendance row can be toggled.
 *
 * Only guests carry a meaningful status — members and volunteers are established by
 * definition. A pinned row stays editable even once the person is a Member: promoting a
 * guest repoints their EventRegistrant, so an override set while they were still a guest
 * would otherwise strand a wrong badge that nobody can click. Volunteers are the
 * exception — their status is forced established upstream, so a toggle could never show
 * an effect and the button would be a dead control.
 */
export function isAttendeeStatusEditable(attendee: AttendeeStatusSubject): boolean {
  if (attendee.kind !== "registrant" || attendee.isVolunteer) return false
  return !attendee.isMember || attendee.hasStatusOverride
}

export type AttendeeStatusChoice = "new" | "returning"

/**
 * What a status menu selection means for one attendance row.
 *
 * Choosing the status the data already implies clears the override rather than pinning the
 * row forever, so a mis-set badge leaves no residue once it is corrected. That also makes the
 * two menu items sufficient on their own: an override only ever exists while it disagrees with
 * the derived value, so the unchecked item *is* the reset.
 */
export function resolveStatusSelection(
  choice: AttendeeStatusChoice,
  derivedIsReturner: boolean,
): { isReturner: boolean; override: boolean | null } {
  const isReturner = choice === "returning"
  return { isReturner, override: isReturner === derivedIsReturner ? null : isReturner }
}

export type SessionAttendeeStatsSubject = {
  isReturner: boolean
  isVolunteer: boolean
  gender: "Male" | "Female" | null
}

export type SessionAttendeeStats = {
  totalCount: number
  newCount: number
  participantCount: number
  volunteersPresent: number
  menCount: number
  womenCount: number
}

/**
 * The session header figures, derived purely from the attendee rows.
 *
 * Pure and row-driven on purpose: the table paints edits optimistically, and these
 * counters have to move with it rather than wait on the next server render.
 */
export function buildSessionAttendeeStats(
  attendees: SessionAttendeeStatsSubject[],
): SessionAttendeeStats {
  const totalCount = attendees.length
  const volunteersPresent = attendees.filter((a) => a.isVolunteer).length

  return {
    totalCount,
    newCount: attendees.filter((a) => !a.isReturner).length,
    participantCount: totalCount - volunteersPresent,
    volunteersPresent,
    menCount: attendees.filter((a) => a.gender === "Male").length,
    womenCount: attendees.filter((a) => a.gender === "Female").length,
  }
}

export function getBreakoutAssignmentLabel(attendee: SessionAttendeeView): string {
  return attendee.breakoutGroupNames.join(", ") || "Unassigned"
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: "base" })
}

export function sortSessionAttendees<T extends SessionAttendeeView>(
  attendees: T[],
  statusSortDirection: AttendeeSortDirection,
): T[] {
  const direction = statusSortDirection === "asc" ? 1 : -1

  return [...attendees].sort((left, right) => {
    const statusComparison = compareText(
      left.isReturner ? "Returning" : "New",
      right.isReturner ? "Returning" : "New",
    )

    if (statusComparison !== 0) return statusComparison * direction

    const breakoutComparison = compareText(
      getBreakoutAssignmentLabel(left),
      getBreakoutAssignmentLabel(right),
    )

    if (breakoutComparison !== 0) return breakoutComparison

    return compareText(left.name ?? "", right.name ?? "")
  })
}

export type BreakoutStatSortMode = "name" | "room"

export type BreakoutStatSubject = {
  name: string
  occupancy: BreakoutOccupancy
}

/**
 * Ordering for the session page's Breakout Groups tab.
 *
 * "name" is the default so the tab keeps the order it has always had. "room"
 * answers the question the admin actually has mid-event — where does the next
 * person go — without making them read four fill bars and do the subtraction.
 * Ties fall back to name so the list never reshuffles between renders.
 */
export function sortBreakoutStats<T extends BreakoutStatSubject>(
  rows: T[],
  mode: BreakoutStatSortMode,
): T[] {
  if (mode === "name") return [...rows].sort((a, b) => compareText(a.name, b.name))

  return [...rows].sort((a, b) => {
    const byRoom = compareByRoom(a.occupancy, b.occupancy)
    return byRoom !== 0 ? byRoom : compareText(a.name, b.name)
  })
}
