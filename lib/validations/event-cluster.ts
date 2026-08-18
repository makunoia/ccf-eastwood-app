import { z } from "zod"
import { ClusterKind } from "@/app/generated/prisma/client"
import { MINISTRY_REQUIRED_ERROR } from "@/lib/clusters/copy"

// Event Cluster (CCF-132) — validation for the cluster CRUD actions and the
// shared-form submission.

const optionalTrimmed = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()))

export const eventClusterSchema = z.object({
  name: z.string().min(1, "Name is required").trim(),
  description: optionalTrimmed,
  date: z.coerce.date().nullish().transform((v) => v ?? null),
})

export type EventClusterInput = z.input<typeof eventClusterSchema>

export const eventClusterSettingsSchema = z.object({
  name: z.string().min(1, "Name is required").trim().optional(),
  description: optionalTrimmed.optional(),
  date: z.coerce.date().nullable().optional(),
  // What shape of day this is (CCF-148). `Collab` changes three things at once —
  // the shared form asks which ministry you're part of rather than which events
  // you're attending, the day's volunteers read as one roster, and the breakout
  // tables belong to the cluster — which is why it is one enum rather than three
  // switches an admin could combine into a shape no real event has.
  kind: z.nativeEnum(ClusterKind).optional(),
  isOpen: z.boolean().optional(),
  // The door form's own switch (CCF-133) — independent of `isOpen` above.
  walkInIsOpen: z.boolean().optional(),
  // The check-in kiosk's switch — independent of both.
  checkInIsOpen: z.boolean().optional(),
  // The day's volunteer sign-up form, independent of all three: serving teams
  // are recruited before the attendee form opens and closed once the roster is
  // full.
  volunteerIsOpen: z.boolean().optional(),
  registrationStart: z.coerce.date().nullable().optional(),
  registrationEnd: z.coerce.date().nullable().optional(),
  logoUrl: optionalTrimmed.optional(),
  themeColorPrimary: optionalTrimmed.optional(),
  registrationPageTitle: optionalTrimmed.optional(),
  registrationPageDescription: optionalTrimmed.optional(),
  registrationPageBannerUrl: optionalTrimmed.optional(),
})

export type EventClusterSettingsInput = z.input<typeof eventClusterSettingsSchema>

/**
 * A form config row belongs to exactly one owner: a single event or a cluster.
 * Both set (or neither) is a programming error — enforced at the app layer
 * because the schema keeps both columns nullable.
 */
export function isValidFormConfigOwner(
  eventId: string | null | undefined,
  clusterId: string | null | undefined
): boolean {
  return Boolean(eventId) !== Boolean(clusterId)
}

/** Same calendar day in UTC — cluster dates and session dates are both stored as bare UTC days. */
export function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

export type ClusterEventLinkInput = {
  eventId: string
  eventName: string
  eventType: "OneTime" | "MultiDay" | "Recurring"
  eventStartDate: Date
  clusterDate: Date | null
  /** The chosen session, resolved by the caller. Required for Recurring links. */
  session: { id: string; eventId: string; date: Date } | null
}

/**
 * Whether an event (and, for Recurring, a chosen session) may be linked to a
 * cluster. Applied to NEW links and session changes only — links that already
 * exist are never re-validated, so pre-existing clusters keep working whatever
 * shape they're in.
 *
 * The rules: a cluster is one day, so everything linked to it must be that day.
 * A OneTime event's own date must match; a Recurring event contributes exactly
 * one session, chosen explicitly, and that session's date must match; MultiDay
 * events span several days by definition, so they can't be a day's member at all.
 */
export function validateClusterEventLink(
  input: ClusterEventLinkInput
): { ok: true } | { ok: false; error: string } {
  if (input.eventType === "MultiDay") {
    return {
      ok: false,
      error: `${input.eventName} is a multi-day event. Multi-day events span several days, so they can't join a single-day cluster.`,
    }
  }

  if (input.eventType === "Recurring") {
    if (!input.session) {
      return {
        ok: false,
        error: `Pick which session of ${input.eventName} this day is for.`,
      }
    }
    if (input.session.eventId !== input.eventId) {
      return {
        ok: false,
        error: `That session doesn't belong to ${input.eventName}.`,
      }
    }
    if (input.clusterDate && !isSameUtcDay(input.session.date, input.clusterDate)) {
      return {
        ok: false,
        error: `The selected session isn't on this cluster's date — pick the session that falls on the same day.`,
      }
    }
    return { ok: true }
  }

  // OneTime
  if (input.session) {
    return {
      ok: false,
      error: `${input.eventName} is a one-time event — it has no sessions to pick.`,
    }
  }
  if (input.clusterDate && !isSameUtcDay(input.eventStartDate, input.clusterDate)) {
    return {
      ok: false,
      error: `${input.eventName} isn't on this cluster's date. Events in a cluster must share its day.`,
    }
  }
  return { ok: true }
}

/**
 * Which of the day's events a submission registers for.
 *
 * The two cluster kinds answer this differently, and the difference is the whole
 * point of the kind:
 *
 *  - **Parallel** — several events sharing a day. The person ticks the ones they
 *    are attending, so any number from one upwards is valid.
 *  - **Collab** — two ministries co-running one event. The person is asked which
 *    *ministry* they are part of, not which events they are attending, and that
 *    answer names exactly one event: theirs. So exactly one, never more.
 *
 * The collab form sends an event id rather than a ministry id — the ministry is
 * only the label on the choice. That keeps everything downstream of here unaware
 * that ministries exist, and it means this function needs no ministry lookup to
 * validate the answer.
 *
 * Kept beside `validateClusterEventSelection` rather than folded into it: that
 * function answers "are these events a legal set", which is still the right
 * question for a Parallel day and the wrong one for a Collab.
 */
export function resolveClusterEventSelection(
  kind: ClusterKind,
  selectedEventIds: string[],
  clusterEventIds: string[]
): { ok: true; eventIds: string[] } | { ok: false; error: string } {
  if (kind !== ClusterKind.Collab) {
    return validateClusterEventSelection(selectedEventIds, clusterEventIds)
  }

  if (clusterEventIds.length === 0) {
    return { ok: false, error: "This event day has no events yet." }
  }

  const unique = [...new Set(selectedEventIds)]
  if (unique.length === 0) {
    return { ok: false, error: MINISTRY_REQUIRED_ERROR }
  }
  // More than one can only come from a hand-built payload — the form is a
  // single-choice control — and there is no sensible way to honour it: two
  // ministries is not an answer to "which ministry are you part of".
  if (unique.length > 1) {
    return { ok: false, error: MINISTRY_REQUIRED_ERROR }
  }
  if (!clusterEventIds.includes(unique[0])) {
    return { ok: false, error: "That group isn't part of this event day." }
  }
  return { ok: true, eventIds: unique }
}

/** ≥1 unique selected event, all of which must belong to the cluster. */
export function validateClusterEventSelection(
  selectedEventIds: string[],
  clusterEventIds: string[]
): { ok: true; eventIds: string[] } | { ok: false; error: string } {
  const unique = [...new Set(selectedEventIds)]
  if (unique.length === 0) {
    return { ok: false, error: "Select at least one event to register for." }
  }
  const clusterSet = new Set(clusterEventIds)
  if (unique.some((id) => !clusterSet.has(id))) {
    return { ok: false, error: "One of the selected events isn't part of this event day." }
  }
  // Preserve the cluster's display order rather than the submission order.
  return { ok: true, eventIds: clusterEventIds.filter((id) => clusterSet.has(id) && unique.includes(id)) }
}
