import type { EventType } from "@/app/generated/prisma/client"

/**
 * The day's check-in links, resolved per cluster event.
 *
 * The cluster check-in page is a monitoring board — attendance is recorded on
 * each event's own public form, not here. Until now the only link it offered was
 * walk-in registration, which reads as if walk-in were the day's *only* way in.
 * These shortcuts put every event's real check-in link on the same board.
 *
 * Which link an event gets follows the public routes exactly:
 *
 *  - **OneTime** → `/events/[id]/checkin`, governed by the event's own
 *    `FormConfig("EventCheckIn")` Public access switch.
 *  - **MultiDay / Recurring** → `/events/[id]/checkin/[occurrenceId]` for the
 *    session this cluster day stands for: the session the cluster link names,
 *    else the event's occurrence on the cluster's date.
 *
 * Pure, and `now` is injectable, so the board and the public page cannot drift
 * into disagreeing about whether a link is live.
 */

export type ClusterCheckinShortcutStatus =
  /** The link works right now. */
  | "open"
  /** OneTime: the check-in form's Public access switch is off. */
  | "formClosed"
  /** Session events: the session exists but isn't accepting check-ins today. */
  | "sessionClosed"
  /** Session events: this day has no session to check into. */
  | "noSession"

export type ClusterCheckinShortcut = {
  eventId: string
  eventName: string
  eventType: EventType
  /** The public check-in link — null whenever it wouldn't work, so the board never offers a dead one. */
  href: string | null
  /** The session the link checks people into. Null for OneTime and when there is no session. */
  sessionDate: Date | null
  status: ClusterCheckinShortcutStatus
  /** Where a staffer with write access goes to fix a non-open status. */
  manageHref: string
}

/** The session a cluster day reads for an event, as far as check-in is concerned. */
export type ClusterCheckinOccurrence = {
  id: string
  date: Date
  isOpen: boolean
}

/**
 * The public occurrence check-in page's own gate: a session is reachable on its
 * own date, or any day once someone has explicitly opened it. Kept here so the
 * shortcut's badge predicts what the link actually does.
 */
function isOccurrenceReachable(
  occurrence: ClusterCheckinOccurrence,
  now: Date
): boolean {
  if (occurrence.isOpen) return true
  return (
    occurrence.date.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)
  )
}

export function resolveClusterCheckinShortcut(input: {
  event: { id: string; name: string; type: EventType }
  /** `FormConfig("EventCheckIn", eventId).isOpen` — OneTime events only. */
  formIsOpen: boolean
  /** The session this cluster day stands for, when the event has one. */
  occurrence: ClusterCheckinOccurrence | null
  now?: Date
}): ClusterCheckinShortcut {
  const { event, formIsOpen, occurrence, now = new Date() } = input
  const base = {
    eventId: event.id,
    eventName: event.name,
    eventType: event.type,
  }

  if (event.type === "OneTime") {
    return {
      ...base,
      href: formIsOpen ? `/events/${event.id}/checkin` : null,
      sessionDate: null,
      status: formIsOpen ? "open" : "formClosed",
      manageHref: `/event/${event.id}/forms/EventCheckIn`,
    }
  }

  // Session events are governed per occurrence, never by the event-wide switch —
  // reading `formIsOpen` here would strand a converted event closed with no UI
  // to reopen it, exactly as the public page's comment warns.
  if (!occurrence) {
    return {
      ...base,
      href: null,
      sessionDate: null,
      status: "noSession",
      manageHref: `/event/${event.id}/sessions`,
    }
  }

  const reachable = isOccurrenceReachable(occurrence, now)
  return {
    ...base,
    href: reachable ? `/events/${event.id}/checkin/${occurrence.id}` : null,
    sessionDate: occurrence.date,
    status: reachable ? "open" : "sessionClosed",
    manageHref: `/event/${event.id}/sessions`,
  }
}

/** Admin-facing reason a shortcut has no usable link, for the authenticated board. */
export function clusterCheckinClosedHint(
  status: Exclude<ClusterCheckinShortcutStatus, "open">
): string {
  switch (status) {
    case "formClosed":
      return "Check-in is closed for this event"
    case "sessionClosed":
      return "This session isn't open for check-in"
    case "noSession":
      return "No session on this day"
  }
}

/** Where to fix it — paired with the hint above. */
export function clusterCheckinManageLabel(
  status: Exclude<ClusterCheckinShortcutStatus, "open">
): string {
  return status === "formClosed" ? "Open the check-in form" : "Open a session"
}
