"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { committeeSchema, roleSchema } from "@/lib/validations/volunteer"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// ─── Committees ───────────────────────────────────────────────────────────────

export async function createMinistryCommittee(
  ministryId: string,
  raw: { name: string }
): Promise<ActionResult<{ id: string }>> {
  const parsed = committeeSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    const committee = await db.volunteerCommittee.create({
      data: { name: parsed.data.name, ministryId },
      select: { id: true },
    })
    revalidatePath(`/ministries/${ministryId}`)
    return { success: true, data: { id: committee.id } }
  } catch {
    return { success: false, error: "Failed to create committee" }
  }
}

export async function createEventCommittee(
  eventId: string,
  raw: { name: string }
): Promise<ActionResult<{ id: string }>> {
  const parsed = committeeSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    const committee = await db.volunteerCommittee.create({
      data: { name: parsed.data.name, eventId },
      select: { id: true },
    })
    revalidatePath(`/events/${eventId}/settings`)
    return { success: true, data: { id: committee.id } }
  } catch {
    return { success: false, error: "Failed to create committee" }
  }
}

export async function deleteCommittee(
  committeeId: string,
  revalidateFor: { ministryId?: string; eventId?: string }
): Promise<ActionResult> {
  try {
    await db.volunteerCommittee.delete({ where: { id: committeeId } })
    if (revalidateFor.ministryId) revalidatePath(`/ministries/${revalidateFor.ministryId}`)
    if (revalidateFor.eventId) revalidatePath(`/events/${revalidateFor.eventId}/settings`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete committee" }
  }
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export async function createRole(
  committeeId: string,
  raw: { name: string },
  revalidateFor: { ministryId?: string; eventId?: string }
): Promise<ActionResult<{ id: string }>> {
  const parsed = roleSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    const role = await db.committeeRole.create({
      data: { name: parsed.data.name, committeeId },
      select: { id: true },
    })
    if (revalidateFor.ministryId) revalidatePath(`/ministries/${revalidateFor.ministryId}`)
    if (revalidateFor.eventId) revalidatePath(`/events/${revalidateFor.eventId}/settings`)
    return { success: true, data: { id: role.id } }
  } catch {
    return { success: false, error: "Failed to create role" }
  }
}

export async function deleteRole(
  roleId: string,
  revalidateFor: { ministryId?: string; eventId?: string }
): Promise<ActionResult> {
  try {
    await db.committeeRole.delete({ where: { id: roleId } })
    if (revalidateFor.ministryId) revalidatePath(`/ministries/${revalidateFor.ministryId}`)
    if (revalidateFor.eventId) revalidatePath(`/events/${revalidateFor.eventId}/settings`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete role" }
  }
}
