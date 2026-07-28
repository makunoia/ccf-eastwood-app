import { z } from "zod"

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
  isOpen: z.boolean().optional(),
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
