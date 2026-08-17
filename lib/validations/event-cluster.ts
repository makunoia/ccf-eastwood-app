import { z } from "zod"
import { ClusterKind } from "@/app/generated/prisma/client"

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
  // no event picker on the shared form, one pooled volunteer roster, and
  // cluster-owned breakout tables — which is why it is one enum rather than three
  // switches an admin could combine into a shape no real event has.
  kind: z.nativeEnum(ClusterKind).optional(),
  isOpen: z.boolean().optional(),
  // The door form's own switch (CCF-133) — independent of `isOpen` above.
  walkInIsOpen: z.boolean().optional(),
  // The check-in kiosk's switch — independent of both.
  checkInIsOpen: z.boolean().optional(),
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
 *  - **Parallel** — the person chose, so validate their choice.
 *  - **Collab** — there is nothing to choose. It is one event as far as anyone
 *    attending is concerned, so the answer is always every member event, and the
 *    submitted selection is **ignored rather than trusted**. The client omits the
 *    picker, but a payload is a claim: honouring a partial selection here would
 *    let a crafted request register for one ministry's half of a joint event,
 *    which is not a state the product has.
 *
 * Kept beside `validateClusterEventSelection` rather than folded into it — that
 * function is about validating a choice, and half the point here is that no
 * choice was made.
 */
export function resolveClusterEventSelection(
  kind: ClusterKind,
  selectedEventIds: string[],
  clusterEventIds: string[]
): { ok: true; eventIds: string[] } | { ok: false; error: string } {
  if (kind === ClusterKind.Collab) {
    if (clusterEventIds.length === 0) {
      return { ok: false, error: "This event day has no events yet." }
    }
    return { ok: true, eventIds: [...clusterEventIds] }
  }
  return validateClusterEventSelection(selectedEventIds, clusterEventIds)
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
