"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import {
  smallGroupSchema,
  type SmallGroupFormValues,
} from "@/lib/validations/small-group"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createSmallGroup(
  raw: SmallGroupFormValues
): Promise<ActionResult<{ id: string }>> {
  const parsed = smallGroupSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  try {
    const group = await db.smallGroup.create({
      data: {
        name: parsed.data.name,
        leaderId: parsed.data.leaderId,
        parentGroupId: parsed.data.parentGroupId ?? null,
        lifeStageId: parsed.data.lifeStageId ?? null,
        genderFocus: parsed.data.genderFocus ?? null,
        language: parsed.data.language ?? null,
        ageRangeMin: parsed.data.ageRangeMin ?? null,
        ageRangeMax: parsed.data.ageRangeMax ?? null,
        meetingFormat: parsed.data.meetingFormat ?? null,
        locationCity: parsed.data.locationCity ?? null,
        memberLimit: parsed.data.memberLimit ?? null,
      },
      select: { id: true },
    })
    revalidatePath("/small-groups")
    return { success: true, data: { id: group.id } }
  } catch {
    return { success: false, error: "Failed to create small group" }
  }
}

export async function updateSmallGroup(
  id: string,
  raw: SmallGroupFormValues
): Promise<ActionResult> {
  const parsed = smallGroupSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  // Prevent circular reference: parentGroupId cannot be self
  if (parsed.data.parentGroupId === id) {
    return { success: false, error: "A group cannot be its own parent" }
  }

  // Prevent circular reference: parentGroupId cannot be a descendant of this group
  if (parsed.data.parentGroupId) {
    const isDescendant = await checkIsDescendant(
      id,
      parsed.data.parentGroupId
    )
    if (isDescendant) {
      return {
        success: false,
        error: "Cannot set a descendant group as the parent",
      }
    }
  }

  try {
    await db.smallGroup.update({
      where: { id },
      data: {
        name: parsed.data.name,
        leaderId: parsed.data.leaderId,
        parentGroupId: parsed.data.parentGroupId ?? null,
        lifeStageId: parsed.data.lifeStageId ?? null,
        genderFocus: parsed.data.genderFocus ?? null,
        language: parsed.data.language ?? null,
        ageRangeMin: parsed.data.ageRangeMin ?? null,
        ageRangeMax: parsed.data.ageRangeMax ?? null,
        meetingFormat: parsed.data.meetingFormat ?? null,
        locationCity: parsed.data.locationCity ?? null,
        memberLimit: parsed.data.memberLimit ?? null,
      },
    })
    revalidatePath("/small-groups")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update small group" }
  }
}

export async function deleteSmallGroup(id: string): Promise<ActionResult> {
  try {
    await db.smallGroup.delete({ where: { id } })
    revalidatePath("/small-groups")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete small group" }
  }
}

// Walk the child tree of `rootId` and check if `candidateId` is in it
async function checkIsDescendant(
  rootId: string,
  candidateId: string
): Promise<boolean> {
  const children = await db.smallGroup.findMany({
    where: { parentGroupId: rootId },
    select: { id: true },
  })
  for (const child of children) {
    if (child.id === candidateId) return true
    if (await checkIsDescendant(child.id, candidateId)) return true
  }
  return false
}
