"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import {
  createVolunteerSchema,
  updateVolunteerSchema,
  type VolunteerFormValues,
} from "@/lib/validations/volunteer"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// ─── Member lookup (used by public sign-up form) ──────────────────────────────

export async function lookupMemberByMobile(mobile: string): Promise<{
  id: string
  firstName: string
  lastName: string
  email: string | null
} | null> {
  const member = await db.member.findFirst({
    where: { phone: mobile.trim() },
    select: { id: true, firstName: true, lastName: true, email: true },
  })
  return member
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createVolunteer(
  raw: VolunteerFormValues
): Promise<ActionResult<{ id: string }>> {
  const parsed = createVolunteerSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const { scopeType, ministryId, eventId, committeeId, preferredRoleId, memberId, notes } =
    parsed.data

  // Enforce scope constraint
  if (scopeType === "ministry" && !ministryId) {
    return { success: false, error: "Ministry is required" }
  }
  if (scopeType === "event" && !eventId) {
    return { success: false, error: "Event is required" }
  }

  // Check for duplicate
  const existing = await db.volunteer.findFirst({
    where: {
      memberId,
      ...(scopeType === "ministry" ? { ministryId } : { eventId }),
    },
  })
  if (existing) {
    return {
      success: false,
      error: "This member is already registered as a volunteer here",
    }
  }

  try {
    const volunteer = await db.volunteer.create({
      data: {
        memberId,
        ministryId: scopeType === "ministry" ? ministryId : null,
        eventId: scopeType === "event" ? eventId : null,
        committeeId,
        preferredRoleId,
        notes: notes ?? null,
        leaderApprovalToken: crypto.randomUUID(),
      },
      select: { id: true },
    })
    revalidatePath("/volunteers")
    return { success: true, data: { id: volunteer.id } }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { success: false, error: "This member is already registered as a volunteer here" }
    }
    return { success: false, error: "Failed to create volunteer" }
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateVolunteer(
  id: string,
  raw: VolunteerFormValues
): Promise<ActionResult> {
  const parsed = updateVolunteerSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const {
    scopeType,
    ministryId,
    eventId,
    committeeId,
    preferredRoleId,
    assignedRoleId,
    memberId,
    status,
    notes,
  } = parsed.data

  if (scopeType === "ministry" && !ministryId) {
    return { success: false, error: "Ministry is required" }
  }
  if (scopeType === "event" && !eventId) {
    return { success: false, error: "Event is required" }
  }

  try {
    await db.volunteer.update({
      where: { id },
      data: {
        memberId,
        ministryId: scopeType === "ministry" ? ministryId : null,
        eventId: scopeType === "event" ? eventId : null,
        committeeId,
        preferredRoleId,
        assignedRoleId: assignedRoleId ?? null,
        status,
        notes: notes ?? null,
      },
    })
    revalidatePath("/volunteers")
    revalidatePath(`/volunteers/${id}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update volunteer" }
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteVolunteer(id: string): Promise<ActionResult> {
  try {
    await db.volunteer.delete({ where: { id } })
    revalidatePath("/volunteers")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete volunteer" }
  }
}
