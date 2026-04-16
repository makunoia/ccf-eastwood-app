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
    const group = await db.$transaction(async (tx) => {
      const created = await tx.smallGroup.create({
        data: {
          name: parsed.data.name,
          leaderId: parsed.data.leaderId,
          parentGroupId: parsed.data.parentGroupId ?? null,
          lifeStageId: parsed.data.lifeStageId ?? null,
          genderFocus: parsed.data.genderFocus ?? null,
          language: parsed.data.language,
          ageRangeMin: parsed.data.ageRangeMin ?? null,
          ageRangeMax: parsed.data.ageRangeMax ?? null,
          meetingFormat: parsed.data.meetingFormat ?? null,
          locationCity: parsed.data.locationCity ?? null,
          memberLimit: parsed.data.memberLimit ?? null,
          scheduleDayOfWeek: parsed.data.scheduleDayOfWeek ?? null,
          scheduleTimeStart: parsed.data.scheduleTimeStart ?? null,
          scheduleTimeEnd: parsed.data.scheduleTimeEnd ?? null,
        },
        select: { id: true },
      })

      // Auto-assign leader to parent group when parent is set
      if (parsed.data.parentGroupId) {
        const firstStatus = await tx.smallGroupStatus.findFirst({
          orderBy: { order: "asc" },
          select: { id: true },
        })
        await tx.member.update({
          where: { id: parsed.data.leaderId },
          data: {
            smallGroupId: parsed.data.parentGroupId,
            smallGroupStatusId: firstStatus?.id ?? null,
          },
        })
      }

      return created
    })
    revalidatePath("/small-groups")
    if (parsed.data.parentGroupId) {
      revalidatePath(`/small-groups/${parsed.data.parentGroupId}`)
    }
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

  // Prevent reducing memberLimit below the current member count
  if (parsed.data.memberLimit !== null) {
    const currentCount = await db.member.count({ where: { smallGroupId: id } })
    if (currentCount > parsed.data.memberLimit) {
      return {
        success: false,
        error: `Cannot set limit to ${parsed.data.memberLimit}: group currently has ${currentCount} member${currentCount === 1 ? "" : "s"}`,
      }
    }
  }

  // Fetch current state to detect changes to parentGroupId or leaderId
  const current = await db.smallGroup.findUnique({
    where: { id },
    select: { parentGroupId: true, leaderId: true },
  })

  try {
    await db.$transaction(async (tx) => {
      await tx.smallGroup.update({
        where: { id },
        data: {
          name: parsed.data.name,
          leaderId: parsed.data.leaderId,
          parentGroupId: parsed.data.parentGroupId ?? null,
          lifeStageId: parsed.data.lifeStageId ?? null,
          genderFocus: parsed.data.genderFocus ?? null,
          language: parsed.data.language,
          ageRangeMin: parsed.data.ageRangeMin ?? null,
          ageRangeMax: parsed.data.ageRangeMax ?? null,
          meetingFormat: parsed.data.meetingFormat ?? null,
          locationCity: parsed.data.locationCity ?? null,
          memberLimit: parsed.data.memberLimit ?? null,
          scheduleDayOfWeek: parsed.data.scheduleDayOfWeek ?? null,
          scheduleTimeStart: parsed.data.scheduleTimeStart ?? null,
          scheduleTimeEnd: parsed.data.scheduleTimeEnd ?? null,
        },
      })

      // Auto-assign leader to parent group when parentGroupId or leaderId changes
      const parentChanged = parsed.data.parentGroupId !== (current?.parentGroupId ?? null)
      const leaderChanged = parsed.data.leaderId !== current?.leaderId
      if (parsed.data.parentGroupId && (parentChanged || leaderChanged)) {
        const firstStatus = await tx.smallGroupStatus.findFirst({
          orderBy: { order: "asc" },
          select: { id: true },
        })
        await tx.member.update({
          where: { id: parsed.data.leaderId },
          data: {
            smallGroupId: parsed.data.parentGroupId,
            smallGroupStatusId: firstStatus?.id ?? null,
          },
        })
      }
    })
    revalidatePath("/small-groups")
    revalidatePath(`/small-groups/${id}`)
    if (parsed.data.parentGroupId) {
      revalidatePath(`/small-groups/${parsed.data.parentGroupId}`)
    }
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

export async function addMemberToGroup(
  groupId: string,
  memberId: string
): Promise<ActionResult> {
  try {
    const group = await db.smallGroup.findUnique({
      where: { id: groupId },
      select: {
        memberLimit: true,
        _count: { select: { members: true } },
      },
    })
    if (!group) return { success: false, error: "Group not found" }
    if (group.memberLimit !== null && group._count.members >= group.memberLimit) {
      return {
        success: false,
        error: `This group has reached its member limit of ${group.memberLimit}`,
      }
    }

    // Default to the first status by order (e.g. "New")
    const firstStatus = await db.smallGroupStatus.findFirst({
      orderBy: { order: "asc" },
      select: { id: true },
    })
    await db.member.update({
      where: { id: memberId },
      data: { smallGroupId: groupId, smallGroupStatusId: firstStatus?.id ?? null },
    })
    revalidatePath(`/small-groups/${groupId}`)
    revalidatePath("/small-groups")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to add member to group" }
  }
}

export async function removeMemberFromGroup(
  memberId: string,
  groupId: string
): Promise<ActionResult> {
  try {
    await db.member.update({
      where: { id: memberId },
      data: { smallGroupId: null, smallGroupStatusId: null },
    })
    revalidatePath(`/small-groups/${groupId}`)
    revalidatePath("/small-groups")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to remove member from group" }
  }
}

export async function updateMemberGroupStatus(
  memberId: string,
  groupId: string,
  statusId: string
): Promise<ActionResult> {
  try {
    await db.member.update({
      where: { id: memberId },
      data: { smallGroupStatusId: statusId },
    })
    revalidatePath(`/small-groups/${groupId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update member status" }
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
