"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import {
  ageRangeBucketSchema,
  type AgeRangeBucketFormValues,
} from "@/lib/validations/age-range-bucket"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createAgeRangeBucket(
  raw: AgeRangeBucketFormValues
): Promise<ActionResult<{ id: string }>> {
  const parsed = ageRangeBucketSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    const bucket = await db.ageRangeBucket.create({
      data: {
        label: parsed.data.label,
        minAge: parsed.data.minAge,
        maxAge: parsed.data.maxAge,
        order: parsed.data.order,
      },
      select: { id: true },
    })
    revalidatePath("/settings/age-ranges")
    return { success: true, data: { id: bucket.id } }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { success: false, error: "An age range with this label already exists" }
    }
    return { success: false, error: "Failed to create age range" }
  }
}

export async function updateAgeRangeBucket(
  id: string,
  raw: AgeRangeBucketFormValues
): Promise<ActionResult> {
  const parsed = ageRangeBucketSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    await db.ageRangeBucket.update({
      where: { id },
      data: {
        label: parsed.data.label,
        minAge: parsed.data.minAge,
        maxAge: parsed.data.maxAge,
        order: parsed.data.order,
      },
    })
    revalidatePath("/settings/age-ranges")
    return { success: true, data: undefined }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { success: false, error: "An age range with this label already exists" }
    }
    return { success: false, error: "Failed to update age range" }
  }
}

export async function deleteAgeRangeBucket(id: string): Promise<ActionResult> {
  try {
    // People keep their record; the bucket reference is nulled by ON DELETE SET NULL.
    await db.ageRangeBucket.delete({ where: { id } })
    revalidatePath("/settings/age-ranges")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete age range" }
  }
}
