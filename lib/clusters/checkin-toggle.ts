import { normalizeUtcDate } from "@/lib/events/occurrence-series"
import type { ClusterCheckinShortcut } from "./checkin-shortcuts"

/**
 * What opening (or closing) a cluster day's check-in has to write, per member event.
 *
 * The day's kiosk switch (`EventCluster.checkInIsOpen`) only ever governed the
 * kiosk's own door. What actually decides whether a person can be checked in to a
 * member event is that event's own control — a `FormConfig` row for OneTime, an
 * `EventOccurrence.isOpen` for a session event — so a staffer had to open the day
 * and then walk into every member event to open it again. This is the fan-out that
 * removes those trips.
 *
 * It is the exact mirror of `resolveClusterCheckinTargets`, and deliberately takes
 * that resolver's own output as its input: the read side already decides which
 * session a cluster day stands for (the one the link names, else the one on the
 * cluster's date), and the write must not re-derive that and drift.
 *
 * Pure, so the rules below are testable without a database.
 */

export type ClusterCheckinOp =
  /** OneTime: the event's `FormConfig("EventCheckIn")` Public access switch. */
  | { kind: "formConfig"; eventId: string; eventName: string }
  /** Session event: the occurrence this day stands for. */
  | { kind: "occurrence"; eventId: string; eventName: string; occurrenceId: string }
  /** Session event with no session for the day — create it, then open it. */
  | { kind: "createSession"; eventId: string; eventName: string; date: Date }
  /** Nothing to write, and why. */
  | { kind: "skip"; eventId: string; eventName: string; reason: ClusterCheckinSkipCause }

export type ClusterCheckinSkipCause =
  /** Opening a session event on a day that has no date — nowhere to put the session. */
  | "noDate"
  /** Closing a session event that has no session. Closing never creates one. */
  | "noSession"

export function planClusterCheckinToggle(
  targets: { shortcut: ClusterCheckinShortcut; occurrenceId: string | null }[],
  isOpen: boolean,
  clusterDate: Date | null
): ClusterCheckinOp[] {
  return targets.map(({ shortcut, occurrenceId }) => {
    const base = { eventId: shortcut.eventId, eventName: shortcut.eventName }

    if (shortcut.eventType === "OneTime") {
      return { kind: "formConfig", ...base } as const
    }

    if (occurrenceId) {
      return { kind: "occurrence", ...base, occurrenceId } as const
    }

    // No session for the day. Closing never creates one — a day being shut down
    // has no business adding sessions to a member event's calendar — and neither
    // does opening a cluster with no date, since there is no day to date it.
    if (!isOpen) return { kind: "skip", ...base, reason: "noSession" } as const
    if (!clusterDate) return { kind: "skip", ...base, reason: "noDate" } as const

    // UTC midnight, the same seam `createOccurrence` and `ensureMultiDayOccurrences`
    // normalize to — and what `EventOccurrence`'s `@@unique([eventId, date])` keys on.
    return { kind: "createSession", ...base, date: normalizeUtcDate(clusterDate) } as const
  })
}

/** Admin-facing reason a member event was passed over, for the toggle's toast. */
export function clusterCheckinSkipHint(reason: ClusterCheckinSkipCause): string {
  return reason === "noDate"
    ? "needs a session — set the day's date in Settings"
    : "has no session for this day"
}
