"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import { eventPriceSchema } from "@/lib/validations/event"
import {
  blockingDependents,
  formatModuleList,
  modulesToEnable,
} from "@/lib/events/modules"
import { EventModuleType } from "@/app/generated/prisma/client"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

async function requireWrite(): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canWrite(session, "Events")) return { error: "Unauthorized." }
  return null
}

async function enabledModules(eventId: string): Promise<EventModuleType[]> {
  const rows = await db.eventModule.findMany({
    where: { eventId },
    select: { type: true },
  })
  return rows.map((r) => r.type)
}

/**
 * Why an event in a cluster can't be priced, or null when it isn't in one.
 *
 * The cluster's shared registration form has no payment step, so a priced member
 * event would take registrations with no fee collected and no payment reference
 * captured. `addEventToCluster` already refuses a priced event on the way in; this
 * is the same invariant on the way out.
 *
 * It has to guard both module entry points: the Settings switch turns Priced on
 * through `enableModule`, while the amount is saved through `setPricedModule`.
 */
async function clusterPricingConflict(eventId: string): Promise<string | null> {
  const membership = await db.eventClusterEvent.findUnique({
    where: { eventId },
    select: { cluster: { select: { name: true } } },
  })
  if (!membership) return null
  return `This event is part of ${membership.cluster.name}. Events in a cluster can't be priced — the shared registration form has no payment step. Remove it from the cluster first.`
}

/** Every surface that reads module state, so a toggle is reflected immediately. */
function revalidateModuleSurfaces(eventId: string) {
  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/event/${eventId}`, "layout")
  revalidatePath(`/event/${eventId}/settings`)
  revalidatePath(`/event/${eventId}/forms`)
  revalidatePath(`/events/${eventId}/register`)
}

// ─── Registration form modules ───────────────────────────────────────────────

// Which sections and fields the form collects now lives in EventFormConfig, keyed
// per (event, context) — see `saveEventFormConfig`. Auto-assign is a placement
// behavior rather than a form section, so it stays a flat column on Event.
export type RegistrationFormModule = "AutoAssignBreakout"

const REGISTRATION_FORM_FIELD: Record<RegistrationFormModule, "autoAssignBreakout"> = {
  AutoAssignBreakout: "autoAssignBreakout",
}

export async function setRegistrationFormModule(
  eventId: string,
  module: RegistrationFormModule,
  enabled: boolean
): Promise<ActionResult> {
  const field = REGISTRATION_FORM_FIELD[module]
  if (!field) return { success: false, error: "Unknown module" }
  try {
    await db.event.update({
      where: { id: eventId },
      data: { [field]: enabled },
    })
    revalidatePath(`/event/${eventId}/settings`)
    revalidatePath(`/events/${eventId}/register`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update registration form module" }
  }
}

// ─── Module toggle ────────────────────────────────────────────────────────────

/**
 * Enable a module along with everything it depends on.
 *
 * Turning on Catch Mech also turns on Breakout Groups and Volunteers, because it
 * can't function without them. The full set comes from `modulesToEnable` so the
 * Settings switches and this write agree on the graph.
 *
 * Returns the modules actually enabled, so the client can reconcile its optimistic
 * state with what the server did rather than guessing.
 */
export async function enableModule(
  eventId: string,
  type: EventModuleType
): Promise<ActionResult<{ enabled: EventModuleType[] }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    if (type === "Priced") {
      const conflict = await clusterPricingConflict(eventId)
      if (conflict) return { success: false, error: conflict }
    }

    const toEnable = modulesToEnable(type, await enabledModules(eventId))

    await db.$transaction(
      toEnable.map((moduleType) =>
        db.eventModule.upsert({
          where: { eventId_type: { eventId, type: moduleType } },
          create: { eventId, type: moduleType },
          update: {},
        })
      )
    )

    revalidateModuleSurfaces(eventId)
    return { success: true, data: { enabled: toEnable } }
  } catch {
    return { success: false, error: "Failed to enable module" }
  }
}

/**
 * Settings that only exist to serve one module, cleared when it is turned off.
 *
 * Both are flat columns on Event that outlive the module row, and both keep
 * *acting* while set: a stale price would show a payment step, and a stale
 * `autoAssignBreakout` would keep placing registrants into breakout groups the
 * admin can no longer reach (CCF-128). Retiring them here keeps "is this event
 * priced / auto-assigning?" a single question with a single answer.
 */
const MODULE_RETIRES: Partial<
  Record<EventModuleType, { price?: null; autoAssignBreakout?: boolean }>
> = {
  Priced: { price: null },
  Breakout: { autoAssignBreakout: false },
}

/**
 * Disable a module, refusing while something else still requires it.
 *
 * Enforced here rather than only by disabling the switch — the dependency has to
 * hold no matter which caller attempts the write. Records belonging to the module
 * (volunteers, breakout groups) are always retained: disabling hides a feature, it
 * never deletes data.
 */
export async function disableModule(
  eventId: string,
  type: EventModuleType
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const blockers = blockingDependents(type, await enabledModules(eventId))
    if (blockers.length > 0) {
      return {
        success: false,
        error: `Turn off ${formatModuleList(blockers)} first — ${
          blockers.length > 1 ? "they depend" : "it depends"
        } on this module.`,
      }
    }

    const retire = MODULE_RETIRES[type]
    await db.$transaction([
      db.eventModule.deleteMany({ where: { eventId, type } }),
      ...(retire
        ? [db.event.update({ where: { id: eventId }, data: retire })]
        : []),
    ])

    revalidateModuleSurfaces(eventId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to disable module" }
  }
}

/**
 * Enable the Priced module and set the fee in one write.
 *
 * The amount is required: a priced event with no price would show a payment step
 * asking for a reference against nothing. Use `disableModule("Priced")` to make an
 * event free again — that clears the stored price.
 */
export async function setPricedModule(
  eventId: string,
  price: string
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = eventPriceSchema.safeParse({ price })
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid price",
    }
  }

  try {
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { type: true },
    })
    if (!event) return { success: false, error: "Event not found" }
    if (event.type === "Recurring") {
      return { success: false, error: "Recurring events can't be priced." }
    }
    const conflict = await clusterPricingConflict(eventId)
    if (conflict) return { success: false, error: conflict }

    await db.$transaction([
      db.eventModule.upsert({
        where: { eventId_type: { eventId, type: "Priced" } },
        create: { eventId, type: "Priced" },
        update: {},
      }),
      db.event.update({
        where: { id: eventId },
        data: { price: parsed.data.price },
      }),
    ])

    revalidateModuleSurfaces(eventId)
    revalidatePath(`/event/${eventId}/registrants`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save the event price" }
  }
}

// ─── Baptism ─────────────────────────────────────────────────────────────────

export async function addBaptismOptIn(
  eventId: string,
  registrantId: string
): Promise<ActionResult> {
  try {
    await db.baptismOptIn.create({ data: { eventId, registrantId } })
    revalidatePath(`/events/${eventId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to add baptism opt-in" }
  }
}

export async function removeBaptismOptIn(
  eventId: string,
  registrantId: string
): Promise<ActionResult> {
  try {
    await db.baptismOptIn.deleteMany({ where: { eventId, registrantId } })
    revalidatePath(`/events/${eventId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to remove baptism opt-in" }
  }
}

// ─── Buses ────────────────────────────────────────────────────────────────────

export async function createBus(
  eventId: string,
  data: { name: string; capacity: string; direction: string }
): Promise<ActionResult<{ id: string }>> {
  if (!data.name.trim()) {
    return { success: false, error: "Bus name is required" }
  }
  try {
    const bus = await db.bus.create({
      data: {
        eventId,
        name: data.name.trim(),
        capacity: data.capacity ? parseInt(data.capacity, 10) : null,
        direction: (data.direction as "ToVenue" | "FromVenue" | "Both") ?? "ToVenue",
      },
      select: { id: true },
    })
    revalidatePath(`/events/${eventId}`)
    return { success: true, data: { id: bus.id } }
  } catch {
    return { success: false, error: "Failed to create bus" }
  }
}

export async function updateBus(
  busId: string,
  eventId: string,
  data: { name: string; capacity: string; direction: string }
): Promise<ActionResult> {
  if (!data.name.trim()) {
    return { success: false, error: "Bus name is required" }
  }
  try {
    await db.bus.update({
      where: { id: busId },
      data: {
        name: data.name.trim(),
        capacity: data.capacity ? parseInt(data.capacity, 10) : null,
        direction: data.direction as "ToVenue" | "FromVenue" | "Both",
      },
    })
    revalidatePath(`/events/${eventId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update bus" }
  }
}

export async function deleteBus(
  busId: string,
  eventId: string
): Promise<ActionResult> {
  try {
    await db.bus.delete({ where: { id: busId } })
    revalidatePath(`/events/${eventId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete bus" }
  }
}

// ─── Bus passengers ───────────────────────────────────────────────────────────

export async function assignToBus(
  busId: string,
  eventId: string,
  registrantId: string | null,
  volunteerId: string | null
): Promise<ActionResult> {
  if (!registrantId && !volunteerId) {
    return { success: false, error: "Must specify a registrant or volunteer" }
  }
  try {
    await db.busPassenger.create({
      data: {
        busId,
        registrantId: registrantId ?? null,
        volunteerId: volunteerId ?? null,
      },
    })
    revalidatePath(`/events/${eventId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to assign to bus" }
  }
}

export async function unassignFromBus(
  passengerId: string,
  eventId: string
): Promise<ActionResult> {
  try {
    await db.busPassenger.delete({ where: { id: passengerId } })
    revalidatePath(`/events/${eventId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to unassign from bus" }
  }
}
