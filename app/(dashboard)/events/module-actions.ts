"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { EventModuleType } from "@/app/generated/prisma/client"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// ─── Module toggle ────────────────────────────────────────────────────────────

export async function enableModule(
  eventId: string,
  type: EventModuleType
): Promise<ActionResult> {
  try {
    await db.eventModule.upsert({
      where: { eventId_type: { eventId, type } },
      create: { eventId, type },
      update: {},
    })
    revalidatePath(`/events/${eventId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to enable module" }
  }
}

export async function disableModule(
  eventId: string,
  type: EventModuleType
): Promise<ActionResult> {
  try {
    await db.eventModule.deleteMany({ where: { eventId, type } })
    revalidatePath(`/events/${eventId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to disable module" }
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
