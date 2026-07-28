"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import {
  FORM_CONTEXTS,
  FORM_TOGGLE_KEYS,
  type EventFormConfigData,
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
    Object.fromEntries(FORM_TOGGLE_KEYS.map((k) => [k, z.boolean().optional()])) as Record<
      keyof EventFormConfigData,
      z.ZodOptional<z.ZodBoolean>
    >
  )
  .strict()

export type EventFormConfigInput = z.infer<typeof togglesSchema>

function revalidateFormSurfaces(eventId: string) {
  revalidatePath(`/event/${eventId}/forms/EventRegistration`)
  revalidatePath(`/event/${eventId}/settings`)
  revalidatePath(`/events/${eventId}/register`)
  revalidatePath(`/events/${eventId}/checkin`)
}

/**
 * Upsert one context's section/field configuration. Creating the row on first
 * write is what makes "bare by default" work: an event with no row collects
 * nothing optional, and only the toggles an admin actually flips get persisted.
 */
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

    await db.eventFormConfig.upsert({
      where: { eventId_context: { eventId, context: parsedContext.data } },
      create: { eventId, context: parsedContext.data, ...data },
      update: data,
    })
    revalidateFormSurfaces(eventId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save registration form configuration" }
  }
}

/** Flip a single toggle — what the builder's switches call. */
export async function setEventFormToggle(
  eventId: string,
  context: FormContext,
  key: keyof EventFormConfigData,
  enabled: boolean
): Promise<ActionResult> {
  if (!FORM_TOGGLE_KEYS.includes(key)) {
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
      select: Object.fromEntries(FORM_TOGGLE_KEYS.map((k) => [k, true])) as Record<
        keyof EventFormConfigData,
        true
      >,
    })
    // No source row means the source is bare — copying that clears the target.
    const data: EventFormConfigData = (source ??
      (Object.fromEntries(
        FORM_TOGGLE_KEYS.map((k) => [k, false])
      ) as EventFormConfigData)) as EventFormConfigData

    await db.eventFormConfig.upsert({
      where: { eventId_context: { eventId, context: parsedTo.data } },
      create: { eventId, context: parsedTo.data, ...data },
      update: data,
    })
    revalidateFormSurfaces(eventId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to copy registration form configuration" }
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

/** Flip a single toggle on a cluster's shared form — what the builder's switches call. */
export async function setClusterFormToggle(
  clusterId: string,
  context: FormContext,
  key: keyof EventFormConfigData,
  enabled: boolean
): Promise<ActionResult> {
  if (!FORM_TOGGLE_KEYS.includes(key)) {
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
      select: Object.fromEntries(FORM_TOGGLE_KEYS.map((k) => [k, true])) as Record<
        keyof EventFormConfigData,
        true
      >,
    })
    // No source row means the source is bare — copying that clears the target.
    const data: EventFormConfigData = (source ??
      (Object.fromEntries(
        FORM_TOGGLE_KEYS.map((k) => [k, false])
      ) as EventFormConfigData)) as EventFormConfigData

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
