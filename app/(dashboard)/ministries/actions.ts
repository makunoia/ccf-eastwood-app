"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { ministrySchema, type MinistryFormValues } from "@/lib/validations/ministry"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createMinistry(
  raw: MinistryFormValues
): Promise<ActionResult<{ id: string }>> {
  const parsed = ministrySchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  try {
    const ministry = await db.ministry.create({
      data: {
        name: parsed.data.name,
        lifeStageId: parsed.data.lifeStageId ?? null,
        description: parsed.data.description ?? null,
      },
      select: { id: true },
    })
    revalidatePath("/ministries")
    return { success: true, data: { id: ministry.id } }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { success: false, error: "A ministry with this name already exists" }
    }
    return { success: false, error: "Failed to create ministry" }
  }
}

export async function updateMinistry(
  id: string,
  raw: MinistryFormValues
): Promise<ActionResult> {
  const parsed = ministrySchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  try {
    await db.ministry.update({
      where: { id },
      data: {
        name: parsed.data.name,
        lifeStageId: parsed.data.lifeStageId ?? null,
        description: parsed.data.description ?? null,
      },
    })
    revalidatePath("/ministries")
    return { success: true, data: undefined }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { success: false, error: "A ministry with this name already exists" }
    }
    return { success: false, error: "Failed to update ministry" }
  }
}

export async function deleteMinistry(id: string): Promise<ActionResult> {
  try {
    await db.ministry.delete({ where: { id } })
    revalidatePath("/ministries")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete ministry" }
  }
}
