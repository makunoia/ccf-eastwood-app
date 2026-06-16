"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import {
  smallGroupSchema,
  type SmallGroupFormValues,
} from "@/lib/validations/small-group"
import { runBatchDelete } from "@/lib/batch"
import type { BatchDeleteResult } from "@/components/batch/types"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

async function requireWrite(): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canWrite(session, "SmallGroups")) return { error: "Unauthorized." }
  return null
}

async function getActorId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

export async function createSmallGroup(
  raw: SmallGroupFormValues
): Promise<ActionResult<{ id: string }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = smallGroupSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  try {
    const actorId = await getActorId()
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
        await tx.member.update({
          where: { id: parsed.data.leaderId },
          data: {
            smallGroupId: parsed.data.parentGroupId,
            groupStatus: "Member",
          },
        })
      }

      await tx.smallGroupLog.create({
        data: {
          smallGroupId: created.id,
          action: "GroupCreated",
          performedByUserId: actorId,
          description: `Group "${parsed.data.name}" was created`,
        },
      })

      // If this leader was a Timothy facilitating breakout groups,
      // link those breakout groups now that their small group exists
      const breakoutsToLink = await tx.breakoutGroup.findMany({
        where: {
          linkedSmallGroupId: null,
          OR: [
            { facilitator: { memberId: parsed.data.leaderId } },
            { coFacilitator: { memberId: parsed.data.leaderId } },
          ],
        },
        select: { id: true },
      })
      if (breakoutsToLink.length > 0) {
        await tx.breakoutGroup.updateMany({
          where: { id: { in: breakoutsToLink.map((b) => b.id) } },
          data: { linkedSmallGroupId: created.id },
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
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

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
        await tx.member.update({
          where: { id: parsed.data.leaderId },
          data: {
            smallGroupId: parsed.data.parentGroupId,
            groupStatus: "Member",
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
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    await db.smallGroup.delete({ where: { id } })
    revalidatePath("/small-groups")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete small group" }
  }
}

export async function deleteSmallGroupsBatch(
  ids: string[]
): Promise<ActionResult<BatchDeleteResult>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (ids.length === 0) return { success: true, data: { deleted: 0, failed: [] } }

  try {
    const groups = await db.smallGroup.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    })
    const names = new Map(groups.map((g) => [g.id, g.name]))

    const result = await runBatchDelete({
      ids,
      names,
      deleteOne: (id) =>
        db.smallGroup.delete({ where: { id } }).then(() => undefined),
      fkReason: "has members or child groups",
    })

    revalidatePath("/small-groups")
    return { success: true, data: result }
  } catch {
    return { success: false, error: "Failed to delete small groups" }
  }
}

export async function setSmallGroupsLifeStageBatch(
  ids: string[],
  lifeStageId: string | null
): Promise<ActionResult<{ updated: number }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (ids.length === 0) return { success: true, data: { updated: 0 } }

  try {
    const result = await db.smallGroup.updateMany({
      where: { id: { in: ids } },
      data: { lifeStageId },
    })
    revalidatePath("/small-groups")
    return { success: true, data: { updated: result.count } }
  } catch {
    return { success: false, error: "Failed to update life stage" }
  }
}

export async function addMemberToGroup(
  groupId: string,
  memberId: string
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const group = await db.smallGroup.findUnique({
      where: { id: groupId },
      select: {
        status: true,
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

    const actorId = await getActorId()
    const member = await db.member.findUnique({
      where: { id: memberId },
      select: { firstName: true, lastName: true },
    })
    await db.member.update({
      where: { id: memberId },
      data: { smallGroupId: groupId, groupStatus: "Member" },
    })
    if (group.status === "Pending") {
      await db.smallGroup.update({ where: { id: groupId }, data: { status: "Active" } })
    }
    await db.smallGroupLog.create({
      data: {
        smallGroupId: groupId,
        action: "MemberAdded",
        memberId,
        performedByUserId: actorId,
        description: member
          ? `${member.firstName} ${member.lastName} was added to the group`
          : "A member was added to the group",
      },
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
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const actorId = await getActorId()
    const member = await db.member.findUnique({
      where: { id: memberId },
      select: { firstName: true, lastName: true },
    })
    await db.member.update({
      where: { id: memberId },
      data: { smallGroupId: null, groupStatus: null },
    })
    await db.smallGroupLog.create({
      data: {
        smallGroupId: groupId,
        action: "MemberRemoved",
        memberId,
        performedByUserId: actorId,
        description: member
          ? `${member.firstName} ${member.lastName} was removed from the group`
          : "A member was removed from the group",
      },
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
  status: "Member" | "Timothy" | "Leader"
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    await db.member.update({
      where: { id: memberId },
      data: { groupStatus: status },
    })
    revalidatePath(`/small-groups/${groupId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update member status" }
  }
}

// ─── Temporary Assignment Actions ────────────────────────────────────────────

export async function assignGuestToGroupTemporarily(
  groupId: string,
  guestId: string
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const guest = await db.guest.findUnique({
      where: { id: guestId },
      select: { firstName: true, lastName: true, memberId: true },
    })
    if (!guest) return { success: false, error: "Guest not found" }
    if (guest.memberId) {
      return { success: false, error: "This guest has already been promoted to a member" }
    }

    // Check for existing pending request for this guest in this group
    const existing = await db.smallGroupMemberRequest.findFirst({
      where: { smallGroupId: groupId, guestId, status: "Pending" },
    })
    if (existing) {
      return { success: false, error: "This guest already has a pending assignment to this group" }
    }

    const actorId = await getActorId()
    await db.$transaction([
      db.smallGroupMemberRequest.create({
        data: {
          smallGroupId: groupId,
          guestId,
          assignedByUserId: actorId,
        },
      }),
      db.smallGroupLog.create({
        data: {
          smallGroupId: groupId,
          action: "TempAssignmentCreated",
          guestId,
          performedByUserId: actorId,
          description: `${guest.firstName} ${guest.lastName} was temporarily assigned to the group (pending leader confirmation)`,
        },
      }),
    ])

    revalidatePath(`/small-groups/${groupId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to assign guest to group" }
  }
}

export async function assignMemberTransferTemporarily(
  groupId: string,
  memberId: string
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const member = await db.member.findUnique({
      where: { id: memberId },
      select: { firstName: true, lastName: true, smallGroupId: true },
    })
    if (!member) return { success: false, error: "Member not found" }
    if (member.smallGroupId === groupId) {
      return { success: false, error: "This member is already in this group" }
    }

    // Check for existing pending transfer request to this group
    const existing = await db.smallGroupMemberRequest.findFirst({
      where: { smallGroupId: groupId, memberId, status: "Pending" },
    })
    if (existing) {
      return { success: false, error: "This member already has a pending transfer to this group" }
    }

    const actorId = await getActorId()
    await db.$transaction([
      db.smallGroupMemberRequest.create({
        data: {
          smallGroupId: groupId,
          memberId,
          fromGroupId: member.smallGroupId ?? null,
          assignedByUserId: actorId,
        },
      }),
      db.smallGroupLog.create({
        data: {
          smallGroupId: groupId,
          action: "TempAssignmentCreated",
          memberId,
          fromGroupId: member.smallGroupId ?? null,
          toGroupId: groupId,
          performedByUserId: actorId,
          description: `${member.firstName} ${member.lastName} was temporarily assigned for transfer to this group (pending leader confirmation)`,
        },
      }),
    ])

    revalidatePath(`/small-groups/${groupId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to assign member transfer" }
  }
}

export async function cancelTempAssignment(
  requestId: string
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const request = await db.smallGroupMemberRequest.findUnique({
      where: { id: requestId },
      select: {
        smallGroupId: true,
        status: true,
        guestId: true,
        memberId: true,
        guest: { select: { firstName: true, lastName: true } },
        member: { select: { firstName: true, lastName: true } },
      },
    })
    if (!request) return { success: false, error: "Request not found" }
    if (request.status !== "Pending") {
      return { success: false, error: "This request has already been resolved" }
    }

    const actorId = await getActorId()
    const personName = request.guest
      ? `${request.guest.firstName} ${request.guest.lastName}`
      : request.member
        ? `${request.member.firstName} ${request.member.lastName}`
        : "Unknown"

    await db.$transaction([
      db.smallGroupMemberRequest.update({
        where: { id: requestId },
        data: { status: "Rejected", resolvedAt: new Date() },
      }),
      db.smallGroupLog.create({
        data: {
          smallGroupId: request.smallGroupId,
          action: "TempAssignmentRejected",
          guestId: request.guestId ?? null,
          memberId: request.memberId ?? null,
          performedByUserId: actorId,
          description: `Temporary assignment for ${personName} was cancelled by admin`,
        },
      }),
    ])

    revalidatePath(`/small-groups/${request.smallGroupId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to cancel assignment" }
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
