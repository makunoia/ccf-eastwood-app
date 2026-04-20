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

export async function createVolunteer(
  raw: VolunteerFormValues
): Promise<ActionResult<{ id: string }>> {
  const parsed = createVolunteerSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const { memberId, eventId, committeeId, preferredRoleId, notes } = parsed.data

  const existing = await db.volunteer.findFirst({
    where: { memberId, eventId },
  })
  if (existing) {
    return {
      success: false,
      error: "This member is already registered as a volunteer for this event",
    }
  }

  try {
    const volunteer = await db.volunteer.create({
      data: {
        memberId,
        eventId,
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
      return {
        success: false,
        error: "This member is already registered as a volunteer for this event",
      }
    }
    return { success: false, error: "Failed to create volunteer" }
  }
}

export async function updateVolunteer(
  id: string,
  raw: VolunteerFormValues
): Promise<ActionResult> {
  const parsed = updateVolunteerSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const { memberId, eventId, committeeId, preferredRoleId, assignedRoleId, status, notes } =
    parsed.data

  try {
    await db.volunteer.update({
      where: { id },
      data: {
        memberId,
        eventId,
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

export async function deleteVolunteer(id: string): Promise<ActionResult> {
  try {
    await db.volunteer.delete({ where: { id } })
    revalidatePath("/volunteers")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete volunteer" }
  }
}
