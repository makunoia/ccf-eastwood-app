"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import {
  BARE_EVENT_FORM_CONFIG,
  FORM_CONTEXTS,
  FORM_PERSISTED_KEYS,
  FORM_TOGGLE_DEFAULTS,
  SUCCESS_MESSAGE_MAX_LENGTH,
  hasIdentityField,
  type EventFormConfigData,
  type FormPersistedKey,
} from "@/lib/forms/context-config"
import type { FormContext } from "@/app/generated/prisma/client"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

async function requireWrite(): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canWrite(session, "Events")) return { error: "Unauthorized." }
  return null
}

const contextSchema = z.enum(FORM_CONTEXTS)

/** Every toggle is optional on input; anything omitted is left untouched. */
const togglesSchema = z
  .object(
    Object.fromEntries(FORM_PERSISTED_KEYS.map((k) => [k, z.boolean().optional()])) as Record<
      keyof EventFormConfigData,
      z.ZodOptional<z.ZodBoolean>
    >
  )
  .strict()

export type EventFormConfigInput = z.infer<typeof togglesSchema>

const SELECT_ALL_TOGGLES = Object.fromEntries(
  FORM_PERSISTED_KEYS.map((k) => [k, true])
) as Record<FormPersistedKey, true>

/**
 * Reject a write that would leave a form unable to recognise anyone.
 *
 * Checked against the *merged* result rather than the incoming partial, because
 * the builder saves one toggle at a time: untick mobile and the payload says
 * nothing at all about email, so only the stored row can answer whether anything
 * identifying survives. A missing row defaults through `FORM_TOGGLE_DEFAULTS`,
 * where both are on.
 */
async function identityGuardError(
  where: { eventId_context: { eventId: string; context: FormContext } } | {
    clusterId_context: { clusterId: string; context: FormContext }
  },
  incoming: Partial<EventFormConfigData>
): Promise<string | null> {
  const touchesIdentity = "fieldMobile" in incoming || "fieldEmail" in incoming
  if (!touchesIdentity) return null

  const stored = await db.eventFormConfig.findUnique({
    where: where as never,
    select: { fieldMobile: true, fieldEmail: true },
  })
  const merged = {
    fieldMobile: incoming.fieldMobile ?? stored?.fieldMobile ?? FORM_TOGGLE_DEFAULTS.fieldMobile,
    fieldEmail: incoming.fieldEmail ?? stored?.fieldEmail ?? FORM_TOGGLE_DEFAULTS.fieldEmail,
  }
  return hasIdentityField(merged)
    ? null
    : "Collect at least one of mobile number or email — otherwise returning people can't be recognised."
}

function revalidateFormSurfaces(eventId: string) {
  revalidatePath(`/event/${eventId}/forms/EventRegistration`)
  revalidatePath(`/event/${eventId}/forms/EventWalkIn`)
  revalidatePath(`/event/${eventId}/settings`)
  revalidatePath(`/events/${eventId}/register`)
  revalidatePath(`/events/${eventId}/walk-in`)
  revalidatePath(`/events/${eventId}/checkin`)
}

/**
 * Upsert one context's section/field configuration. Creating the row on first
 * write is what makes "bare by default" work: an event with no row collects
 * nothing optional, and only the toggles an admin actually flips get persisted.
 */
/**
 * The one way an admin write reaches an event's form config.
 *
 * Exists so `configuredAt` cannot be forgotten at one of the four call sites —
 * the setup checklist reads it as "a person has been through the builder", and a
 * path that skipped the stamp would leave that admin's event looking untouched.
 * The same "spelled out in N places until they disagreed" shape that
 * lib/breakouts/occupancy.ts exists to prevent.
 *
 * Stamped on update as well as create: re-saving is still an admin being here,
 * and the checklist only cares that it is non-null.
 */
function upsertEventFormConfig(
  eventId: string,
  context: FormContext,
  data: Partial<EventFormConfigData> & { successMessage?: string | null }
) {
  const configuredAt = new Date()
  return db.eventFormConfig.upsert({
    where: { eventId_context: { eventId, context } },
    create: { eventId, context, configuredAt, ...data },
    update: { ...data, configuredAt },
  })
}

export async function saveEventFormConfig(
  eventId: string,
  context: FormContext,
  raw: EventFormConfigInput
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsedContext = contextSchema.safeParse(context)
  if (!parsedContext.success) {
    return { success: false, error: "Unknown form context." }
  }
  const parsed = togglesSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  // Drop undefined so an omitted toggle doesn't overwrite a stored value.
  const data = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined)
  ) as Partial<EventFormConfigData>

  try {
    const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } })
    if (!event) return { success: false, error: "Event not found." }

    const guardError = await identityGuardError(
      { eventId_context: { eventId, context: parsedContext.data } },
      data
    )
    if (guardError) return { success: false, error: guardError }

    await upsertEventFormConfig(eventId, parsedContext.data, data)
    revalidateFormSurfaces(eventId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save registration form configuration" }
  }
}

/** Flip a single toggle — what the builder's switches and Required controls call. */
export async function setEventFormToggle(
  eventId: string,
  context: FormContext,
  key: FormPersistedKey,
  enabled: boolean
): Promise<ActionResult> {
  if (!FORM_PERSISTED_KEYS.includes(key)) {
    return { success: false, error: "Unknown form toggle." }
  }
  return saveEventFormConfig(eventId, context, { [key]: enabled })
}

/**
 * Copy one context's configuration onto another — admins usually want Walk-in to
 * start from whatever Register already collects.
 */
export async function copyEventFormConfig(
  eventId: string,
  from: FormContext,
  to: FormContext
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (from === to) return { success: false, error: "Pick two different contexts." }
  const parsedFrom = contextSchema.safeParse(from)
  const parsedTo = contextSchema.safeParse(to)
  if (!parsedFrom.success || !parsedTo.success) {
    return { success: false, error: "Unknown form context." }
  }

  try {
    const source = await db.eventFormConfig.findUnique({
      where: { eventId_context: { eventId, context: parsedFrom.data } },
      select: SELECT_ALL_TOGGLES,
    })
    // No source row means the source is bare — copying that resets the target to
    // the defaults, which still collect mobile and email. Copying an all-false
    // object here would let an unconfigured Register strip the target's identity
    // fields, which the guard above exists to prevent.
    const data: EventFormConfigData =
      (source as EventFormConfigData | null) ?? { ...BARE_EVENT_FORM_CONFIG }

    await upsertEventFormConfig(eventId, parsedTo.data, data)
    revalidateFormSurfaces(eventId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to copy registration form configuration" }
  }
}

// ─── Walk-in session (CCF-133) ───────────────────────────────────────────────

/**
 * Point the walk-in form at one of the event's sessions, or clear it with null.
 *
 * The occurrence used to ride in the URL (`?checkin=<id>`), which meant a stale
 * link could register someone into the wrong session and only a `notFound()`
 * guard stood in the way. Making it stored config means the door always targets
 * the session an admin actually named — and a null (or closed) session closes the
 * walk-in form rather than silently defaulting somewhere.
 *
 * OneTime events never set this: they have no occurrences, and a walk-in there
 * stamps `attendedAt` on the registrant instead.
 *
 * Also switches the event back to `Pinned`, since naming a session is what
 * "pinned" means — picking one from the dropdown has to end Latest mode, or the
 * pick would save and then be ignored.
 */
export async function setWalkInOccurrence(
  eventId: string,
  occurrenceId: string | null
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { id: true, type: true },
    })
    if (!event) return { success: false, error: "Event not found." }
    if (event.type === "OneTime" && occurrenceId !== null) {
      return { success: false, error: "One-time events have no sessions to pick." }
    }

    // Verify ownership rather than trusting the id: the FK alone would happily
    // accept another event's session and quietly cross-post its attendance.
    if (occurrenceId !== null) {
      const occurrence = await db.eventOccurrence.findFirst({
        where: { id: occurrenceId, eventId },
        select: { id: true },
      })
      if (!occurrence) return { success: false, error: "That session isn't part of this event." }
    }

    await db.event.update({
      where: { id: eventId },
      data: { walkInOccurrenceId: occurrenceId, walkInSessionMode: "Pinned" },
    })
    revalidateFormSurfaces(eventId)
    revalidatePath(`/events/${eventId}/checkin`, "layout")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to set the walk-in session" }
  }
}

/**
 * Aim the door at whichever session is newest, from now on.
 *
 * The dropdown's other option. A Recurring event creates a session each time
 * check-in is opened, so a pinned target is correct for one night and stale after
 * that; this makes "the session we just started" the standing answer instead of a
 * weekly chore. See `lib/events/walk-in-session.ts` for the resolution rule.
 *
 * The stale pin is left in the column on purpose: it is ignored while in Latest
 * mode, and keeping it means switching back doesn't lose which session was named.
 */
export async function setWalkInLatestSession(eventId: string): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { id: true, type: true },
    })
    if (!event) return { success: false, error: "Event not found." }
    // OneTime events have no sessions to be latest of, so there is nothing this
    // mode could mean for them.
    if (event.type === "OneTime") {
      return { success: false, error: "One-time events have no sessions to pick." }
    }

    await db.event.update({
      where: { id: eventId },
      data: { walkInSessionMode: "Latest" },
    })
    revalidateFormSurfaces(eventId)
    revalidatePath(`/events/${eventId}/checkin`, "layout")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to set the walk-in session" }
  }
}

// ─── Success screen copy (CCF-130) ───────────────────────────────────────────

/**
 * Blank means "use the default", so an empty submission stores NULL rather than
 * an empty string — that keeps "unset" a single value instead of two that the
 * read path would have to treat alike.
 */
const successMessageSchema = z
  .string()
  .max(
    SUCCESS_MESSAGE_MAX_LENGTH,
    `Keep the message under ${SUCCESS_MESSAGE_MAX_LENGTH} characters.`
  )
  .transform((v) => v.trim() || null)
  .nullable()

/** Set (or clear, with a blank string) one context's success screen sub copy. */
export async function saveEventFormSuccessMessage(
  eventId: string,
  context: FormContext,
  raw: string | null
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsedContext = contextSchema.safeParse(context)
  if (!parsedContext.success) {
    return { success: false, error: "Unknown form context." }
  }
  const parsed = successMessageSchema.safeParse(raw ?? "")
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } })
    if (!event) return { success: false, error: "Event not found." }

    await upsertEventFormConfig(eventId, parsedContext.data, { successMessage: parsed.data })
    revalidateFormSurfaces(eventId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save the success message" }
  }
}

/** Cluster shared form equivalent of {@link saveEventFormSuccessMessage}. */
export async function saveClusterFormSuccessMessage(
  clusterId: string,
  context: FormContext,
  raw: string | null
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (!CLUSTER_FORM_CONTEXTS.includes(context as (typeof CLUSTER_FORM_CONTEXTS)[number])) {
    return { success: false, error: "Unknown form context." }
  }
  const parsed = successMessageSchema.safeParse(raw ?? "")
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    const cluster = await db.eventCluster.findUnique({
      where: { id: clusterId },
      select: { id: true },
    })
    if (!cluster) return { success: false, error: "Event cluster not found." }

    await db.eventFormConfig.upsert({
      where: { clusterId_context: { clusterId, context } },
      create: { clusterId, context, successMessage: parsed.data },
      update: { successMessage: parsed.data },
    })
    await revalidateClusterFormSurfaces(clusterId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save the success message" }
  }
}

// ─── Cluster shared form (CCF-132) ───────────────────────────────────────────
// Same builder, same toggles — the config row hangs off a cluster instead of an
// event. Clusters only have Register and Walk-in surfaces (no CheckIn context).

const CLUSTER_FORM_CONTEXTS = ["Register", "WalkIn"] as const

async function revalidateClusterFormSurfaces(clusterId: string) {
  revalidatePath(`/cluster/${clusterId}/forms`)
  revalidatePath(`/cluster/${clusterId}/settings`)
  const cluster = await db.eventCluster.findUnique({
    where: { id: clusterId },
    select: { publicToken: true },
  })
  if (cluster) revalidatePath(`/register/c/${cluster.publicToken}`)
}

/** Upsert one context's configuration for a cluster's shared form. */
export async function saveClusterFormConfig(
  clusterId: string,
  context: FormContext,
  raw: EventFormConfigInput
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (!CLUSTER_FORM_CONTEXTS.includes(context as (typeof CLUSTER_FORM_CONTEXTS)[number])) {
    return { success: false, error: "Unknown form context." }
  }
  const parsed = togglesSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const data = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined)
  ) as Partial<EventFormConfigData>

  try {
    const cluster = await db.eventCluster.findUnique({
      where: { id: clusterId },
      select: { id: true },
    })
    if (!cluster) return { success: false, error: "Event cluster not found." }

    const guardError = await identityGuardError(
      { clusterId_context: { clusterId, context } },
      data
    )
    if (guardError) return { success: false, error: guardError }

    await db.eventFormConfig.upsert({
      where: { clusterId_context: { clusterId, context } },
      create: { clusterId, context, ...data },
      update: data,
    })
    await revalidateClusterFormSurfaces(clusterId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save registration form configuration" }
  }
}

/** Flip a single toggle on a cluster's shared form — what the builder's controls call. */
export async function setClusterFormToggle(
  clusterId: string,
  context: FormContext,
  key: FormPersistedKey,
  enabled: boolean
): Promise<ActionResult> {
  if (!FORM_PERSISTED_KEYS.includes(key)) {
    return { success: false, error: "Unknown form toggle." }
  }
  return saveClusterFormConfig(clusterId, context, { [key]: enabled })
}

/** Copy one cluster context's configuration onto another (Walk-in from Register). */
export async function copyClusterFormConfig(
  clusterId: string,
  from: FormContext,
  to: FormContext
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (from === to) return { success: false, error: "Pick two different contexts." }
  const validContexts = CLUSTER_FORM_CONTEXTS as readonly string[]
  if (!validContexts.includes(from) || !validContexts.includes(to)) {
    return { success: false, error: "Unknown form context." }
  }

  try {
    const source = await db.eventFormConfig.findUnique({
      where: { clusterId_context: { clusterId, context: from } },
      select: SELECT_ALL_TOGGLES,
    })
    // No source row means the source is bare — see the event-side copy for why
    // that resets to the defaults rather than to all-false.
    const data: EventFormConfigData =
      (source as EventFormConfigData | null) ?? { ...BARE_EVENT_FORM_CONFIG }

    await db.eventFormConfig.upsert({
      where: { clusterId_context: { clusterId, context: to } },
      create: { clusterId, context: to, ...data },
      update: data,
    })
    await revalidateClusterFormSurfaces(clusterId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to copy registration form configuration" }
  }
}
