"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import {
  smallGroupStatusSchema,
  type SmallGroupStatusFormValues,
} from "@/lib/validations/small-group-status"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createSmallGroupStatus(
  raw: SmallGroupStatusFormValues
): Promise<ActionResult<{ id: string }>> {
  const parsed = smallGroupStatusSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    const status = await db.smallGroupStatus.create({
      data: { name: parsed.data.name, order: parsed.data.order },
      select: { id: true },
    })
    revalidatePath("/settings/small-group-statuses")
    return { success: true, data: { id: status.id } }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { success: false, error: "A status with this name already exists" }
    }
    return { success: false, error: "Failed to create status" }
  }
}

export async function updateSmallGroupStatus(
  id: string,
  raw: SmallGroupStatusFormValues
): Promise<ActionResult> {
  const parsed = smallGroupStatusSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    await db.smallGroupStatus.update({
      where: { id },
      data: { name: parsed.data.name, order: parsed.data.order },
    })
    revalidatePath("/settings/small-group-statuses")
    return { success: true, data: undefined }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { success: false, error: "A status with this name already exists" }
    }
    return { success: false, error: "Failed to update status" }
  }
}

export async function deleteSmallGroupStatus(id: string): Promise<ActionResult> {
  try {
    await db.smallGroupStatus.delete({ where: { id } })
    revalidatePath("/settings/small-group-statuses")
    return { success: true, data: undefined }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return {
        success: false,
        error: "Cannot delete a status that is currently assigned to members",
      }
    }
    return { success: false, error: "Failed to delete status" }
  }
}
