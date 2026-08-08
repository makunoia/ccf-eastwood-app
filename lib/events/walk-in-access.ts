import type { EventType } from "@/app/generated/prisma/client"

/**
 * Whether an event's walk-in form is reachable, and why not when it isn't
 * (CCF-133).
 *
 * Two independent gates, both of which must pass:
 *
 *  1. The walk-in form's own `FormConfig.isOpen`. It defaults closed — a
 *     standalone URL that registers *and* records attendance is a live
 *     attendance surface, so staff open it for the day.
 *  2. For MultiDay/Recurring, the event's named session must exist and be open.
 *     It is named by opening that session's check-in on Sessions, or by hand on
 *     the walk-in form config. OneTime events have no occurrences at all; a
 *     walk-in there stamps `attendedAt`, so there is nothing to check.
 *
 * Neither gate is the registration form's. Closing pre-registration the night
 * before must leave the door running, which is the whole point of the split.
 *
 * Pure, so the public walk-in page and the check-in board that links to it
 * cannot drift into disagreeing about whether the door is open.
 */

export type WalkInAccess =
  | { open: true; occurrenceId: string | null }
  | { open: false; reason: WalkInClosedReason }

/** Why the door is shut. `noSession` covers unset, deleted and closed alike. */
export type WalkInClosedReason = "formClosed" | "noSession"

export function resolveWalkInAccess(input: {
  eventType: EventType
  /** `FormConfig("EventWalkIn", eventId).isOpen`. */
  formIsOpen: boolean
  /** The event's configured walk-in session, if it still exists. */
  session: { id: string; isOpen: boolean } | null
}): WalkInAccess {
  if (!input.formIsOpen) return { open: false, reason: "formClosed" }

  if (input.eventType === "OneTime") return { open: true, occurrenceId: null }

  if (!input.session || !input.session.isOpen) {
    return { open: false, reason: "noSession" }
  }
  return { open: true, occurrenceId: input.session.id }
}

/**
 * Attendee-facing copy for a closed door.
 *
 * Deliberately says nothing about switches or sessions: the check-in board is a
 * public kiosk, so this is read by the person standing at it, not the staff
 * member who can reopen it.
 */
export const WALK_IN_CLOSED_MESSAGE = "Walk-in registration isn't open right now — please ask a staff member for help."

/** Admin-facing reason, for the authenticated cluster board. */
export function walkInClosedAdminHint(reason: WalkInClosedReason): string {
  return reason === "formClosed"
    ? "Walk-in is closed. Open it from the Walk-in form."
    : "No open session is selected for walk-in. Open a session's check-in on Sessions."
}
