"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { lifeStageSchema, type LifeStageFormValues } from "@/lib/validations/life-stage"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createLifeStage(
  raw: LifeStageFormValues
): Promise<ActionResult<{ id: string }>> {
  const parsed = lifeStageSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    const lifeStage = await db.lifeStage.create({
      data: { name: parsed.data.name, order: parsed.data.order },
      select: { id: true },
    })
    revalidatePath("/settings/life-stages")
    return { success: true, data: { id: lifeStage.id } }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { success: false, error: "A life stage with this name already exists" }
    }
    return { success: false, error: "Failed to create life stage" }
  }
}

export async function updateLifeStage(
  id: string,
  raw: LifeStageFormValues
): Promise<ActionResult> {
  const parsed = lifeStageSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    await db.lifeStage.update({
      where: { id },
      data: { name: parsed.data.name, order: parsed.data.order },
    })
    revalidatePath("/settings/life-stages")
    return { success: true, data: undefined }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { success: false, error: "A life stage with this name already exists" }
    }
    return { success: false, error: "Failed to update life stage" }
  }
}

export async function deleteLifeStage(id: string): Promise<ActionResult> {
  try {
    await db.lifeStage.delete({ where: { id } })
    revalidatePath("/settings/life-stages")
    return { success: true, data: undefined }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      return {
        success: false,
        error: "Cannot delete a life stage that is in use by members, ministries, or groups",
      }
    }
    return { success: false, error: "Failed to delete life stage" }
  }
}
