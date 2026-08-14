"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canRead, canWrite } from "@/lib/permissions"
import {
  smallGroupSchema,
  type SmallGroupFormValues,
} from "@/lib/validations/small-group"
import { runBatchDelete } from "@/lib/batch"
import { findSpouse, type SpouseInfo } from "@/lib/family-links"
import {
  logMembershipMove,
  logLeaderChange,
  logGroupStatusChange,
} from "@/lib/small-groups/membership-log"
import {
  RESOLVABLE_REQUEST_SELECT,
  personNameOf,
  resolveMemberRequest,
  type SkipReason,
} from "@/lib/small-groups/resolve-member-request"
import { clearUpwardSatelliteOnConfirm } from "@/lib/small-groups/upward-satellite"
import type { BatchDeleteResult, BatchFailure } from "@/components/batch/types"

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
          parentSatellite: parsed.data.parentSatellite ?? null,
          groupType: parsed.data.groupType,
          lifeStages: { connect: parsed.data.lifeStageIds.map((id) => ({ id })) },
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
        const leader = await tx.member.findUnique({
          where: { id: parsed.data.leaderId },
          select: { firstName: true, lastName: true, smallGroupId: true },
        })
        await tx.member.update({
          where: { id: parsed.data.leaderId },
          data: {
            smallGroupId: parsed.data.parentGroupId,
            groupStatus: "Member",
          },
        })
        if (leader) {
          await logMembershipMove(tx, {
            memberId: parsed.data.leaderId,
            memberName: `${leader.firstName} ${leader.lastName}`,
            fromGroupId: leader.smallGroupId,
            toGroupId: parsed.data.parentGroupId,
            actor: { userId: actorId },
            context: `as the leader of "${parsed.data.name}"`,
          })
        }
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
    return { success: false, error: "Failed to create DGroup" }
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

  // Fetch current state to detect changes to parentGroupId or leaderId. The
  // outgoing leader's name comes along because only `description` will still
  // name them if that member is ever deleted.
  const current = await db.smallGroup.findUnique({
    where: { id },
    select: {
      parentGroupId: true,
      leaderId: true,
      leader: { select: { firstName: true, lastName: true } },
    },
  })

  try {
    const actorId = await getActorId()
    await db.$transaction(async (tx) => {
      await tx.smallGroup.update({
        where: { id },
        data: {
          name: parsed.data.name,
          leaderId: parsed.data.leaderId,
          parentGroupId: parsed.data.parentGroupId ?? null,
          parentSatellite: parsed.data.parentSatellite ?? null,
          groupType: parsed.data.groupType,
          lifeStages: { set: parsed.data.lifeStageIds.map((id) => ({ id })) },
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

      const parentChanged = parsed.data.parentGroupId !== (current?.parentGroupId ?? null)
      const leaderChanged = parsed.data.leaderId !== current?.leaderId

      if (leaderChanged) {
        const incoming = await tx.member.findUnique({
          where: { id: parsed.data.leaderId },
          select: { firstName: true, lastName: true },
        })
        if (incoming) {
          await logLeaderChange(tx, {
            smallGroupId: id,
            toLeaderId: parsed.data.leaderId,
            toLeaderName: `${incoming.firstName} ${incoming.lastName}`,
            fromLeaderId: current?.leaderId ?? null,
            fromLeaderName: current?.leader
              ? `${current.leader.firstName} ${current.leader.lastName}`
              : null,
            actor: { userId: actorId },
          })
        }
      }

      // Auto-assign leader to parent group when parentGroupId or leaderId changes
      if (parsed.data.parentGroupId && (parentChanged || leaderChanged)) {
        const leader = await tx.member.findUnique({
          where: { id: parsed.data.leaderId },
          select: { firstName: true, lastName: true, smallGroupId: true },
        })
        await tx.member.update({
          where: { id: parsed.data.leaderId },
          data: {
            smallGroupId: parsed.data.parentGroupId,
            groupStatus: "Member",
          },
        })
        if (leader) {
          await logMembershipMove(tx, {
            memberId: parsed.data.leaderId,
            memberName: `${leader.firstName} ${leader.lastName}`,
            fromGroupId: leader.smallGroupId,
            toGroupId: parsed.data.parentGroupId,
            actor: { userId: actorId },
            context: `as the leader of "${parsed.data.name}"`,
          })
        }
      }

      // Moving the parent to an outside satellite undoes that auto-assignment:
      // the leader now reports elsewhere, so drop the membership this created.
      // Scoped to the old parent so a hand-picked group is never touched.
      if (parsed.data.parentSatellite && parentChanged && current?.parentGroupId) {
        const leaderId = current.leaderId ?? parsed.data.leaderId
        const removed = await tx.member.updateMany({
          where: {
            id: leaderId,
            smallGroupId: current.parentGroupId,
          },
          data: { smallGroupId: null, groupStatus: null },
        })
        // updateMany, so the scoping above may have matched nobody — only log a
        // departure that actually happened.
        if (removed.count > 0) {
          const leader = await tx.member.findUnique({
            where: { id: leaderId },
            select: { firstName: true, lastName: true },
          })
          if (leader) {
            await logMembershipMove(tx, {
              memberId: leaderId,
              memberName: `${leader.firstName} ${leader.lastName}`,
              fromGroupId: current.parentGroupId,
              toGroupId: null,
              actor: { userId: actorId },
              context: `when "${parsed.data.name}" moved to an outside satellite`,
            })
          }
        }
      }
    })
    revalidatePath("/small-groups")
    revalidatePath(`/small-groups/${id}`)
    if (parsed.data.parentGroupId) {
      revalidatePath(`/small-groups/${parsed.data.parentGroupId}`)
    }
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update DGroup" }
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
    return { success: false, error: "Failed to delete DGroup" }
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
    return { success: false, error: "Failed to delete DGroups" }
  }
}

export async function setSmallGroupsLifeStageBatch(
  ids: string[],
  lifeStageId: string | null
): Promise<ActionResult<{ updated: number }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (ids.length === 0) return { success: true, data: { updated: 0 } }

  // SmallGroup life stage is many-to-many; a bulk "set" replaces each group's
  // life stages with the single chosen one (or clears them when null).
  const lifeStages = lifeStageId
    ? { set: [{ id: lifeStageId }] }
    : { set: [] }

  try {
    let updated = 0
    await db.$transaction(async (tx) => {
      for (const id of ids) {
        await tx.smallGroup.update({ where: { id }, data: { lifeStages } })
        updated++
      }
    })
    revalidatePath("/small-groups")
    return { success: true, data: { updated } }
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
    // The group they are leaving, read before the update overwrites it — the
    // picker offers members who are already in another group, and one group per
    // member means adding them here is also a removal from there.
    const member = await db.member.findUnique({
      where: { id: memberId },
      select: { firstName: true, lastName: true, smallGroupId: true },
    })
    if (!member) return { success: false, error: "Member not found" }

    const fromGroupId = member.smallGroupId
    await db.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: memberId },
        data: { smallGroupId: groupId, groupStatus: "Member" },
      })
      if (group.status === "Pending") {
        await tx.smallGroup.update({ where: { id: groupId }, data: { status: "Active" } })
      }
      await logMembershipMove(tx, {
        memberId,
        memberName: `${member.firstName} ${member.lastName}`,
        fromGroupId,
        toGroupId: groupId,
        actor: { userId: actorId },
      })
    })

    revalidatePath(`/small-groups/${groupId}`)
    if (fromGroupId) revalidatePath(`/small-groups/${fromGroupId}`)
    revalidatePath("/small-groups")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to add member to group" }
  }
}

/**
 * Looks up the spouse of a member (derived from Family data) for the couples
 * group add flow. Read-only.
 */
export async function getSpouseForMember(
  memberId: string
): Promise<ActionResult<SpouseInfo | null>> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Not authenticated." }

  try {
    const spouse = await findSpouse(memberId)
    return { success: true, data: spouse }
  } catch {
    return { success: false, error: "Failed to look up spouse" }
  }
}

/**
 * Adds a married couple to a Couples group in one transaction. Both members'
 * one-group-per-member rule applies: each spouse's smallGroupId is simply set
 * to this group (moving them out of any previous group).
 */
export async function addCoupleToGroup(
  groupId: string,
  memberId: string,
  spouseMemberId: string
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (memberId === spouseMemberId) {
    return { success: false, error: "A member cannot be their own spouse" }
  }

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
    if (group.memberLimit !== null && group._count.members + 2 > group.memberLimit) {
      return {
        success: false,
        error: `Adding both spouses would exceed the member limit of ${group.memberLimit}`,
      }
    }

    // smallGroupId included so each spouse's previous group records their exit —
    // the two of them can arrive from two different groups, or from none.
    const [member, spouse] = await Promise.all([
      db.member.findUnique({
        where: { id: memberId },
        select: { firstName: true, lastName: true, smallGroupId: true },
      }),
      db.member.findUnique({
        where: { id: spouseMemberId },
        select: { firstName: true, lastName: true, smallGroupId: true },
      }),
    ])
    if (!member || !spouse) return { success: false, error: "Member not found" }

    const actorId = await getActorId()
    await db.$transaction(async (tx) => {
      for (const [id, person] of [
        [memberId, member],
        [spouseMemberId, spouse],
      ] as const) {
        await tx.member.update({
          where: { id },
          data: { smallGroupId: groupId, groupStatus: "Member" },
        })
        await logMembershipMove(tx, {
          memberId: id,
          memberName: `${person.firstName} ${person.lastName}`,
          fromGroupId: person.smallGroupId,
          toGroupId: groupId,
          actor: { userId: actorId },
          context: "(couple)",
        })
      }
      if (group.status === "Pending") {
        await tx.smallGroup.update({ where: { id: groupId }, data: { status: "Active" } })
      }
    })

    revalidatePath(`/small-groups/${groupId}`)
    for (const from of [member.smallGroupId, spouse.smallGroupId]) {
      if (from) revalidatePath(`/small-groups/${from}`)
    }
    revalidatePath("/small-groups")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to add couple to group" }
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
    const actorId = await getActorId()
    const member = await db.member.findUnique({
      where: { id: memberId },
      select: { firstName: true, lastName: true, groupStatus: true },
    })
    if (!member) return { success: false, error: "Member not found" }

    await db.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: memberId },
        data: { groupStatus: status },
      })
      await logGroupStatusChange(tx, {
        smallGroupId: groupId,
        memberId,
        memberName: `${member.firstName} ${member.lastName}`,
        from: member.groupStatus,
        to: status,
        actor: { userId: actorId },
      })
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

/**
 * Creates paired pending requests for both spouses into a Couples group
 * (transfer semantics — each request records the member's current group).
 * The group leader confirms or declines both via the confirmation link.
 */
export async function requestCoupleAssignment(
  groupId: string,
  memberIdA: string,
  memberIdB: string
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (memberIdA === memberIdB) {
    return { success: false, error: "A member cannot be their own spouse" }
  }

  try {
    const group = await db.smallGroup.findUnique({
      where: { id: groupId },
      select: {
        name: true,
        groupType: true,
        memberLimit: true,
        _count: { select: { members: true } },
      },
    })
    if (!group) return { success: false, error: "Group not found" }
    if (group.groupType !== "Couples") {
      return { success: false, error: "Couple requests are only available for couples groups" }
    }
    if (group.memberLimit !== null && group._count.members + 2 > group.memberLimit) {
      return {
        success: false,
        error: `Adding both spouses would exceed the member limit of ${group.memberLimit}`,
      }
    }

    const members = await db.member.findMany({
      where: { id: { in: [memberIdA, memberIdB] } },
      select: { id: true, firstName: true, lastName: true, smallGroupId: true },
    })
    if (members.length !== 2) return { success: false, error: "Member not found" }
    if (members.some((m) => m.smallGroupId === groupId)) {
      return { success: false, error: "One of the spouses is already in this group" }
    }

    const existingPending = await db.smallGroupMemberRequest.findFirst({
      where: {
        smallGroupId: groupId,
        memberId: { in: [memberIdA, memberIdB] },
        status: "Pending",
      },
      select: { id: true },
    })
    if (existingPending) {
      return { success: false, error: "One of the spouses already has a pending request to this group" }
    }

    const actorId = await getActorId()
    await db.$transaction(async (tx) => {
      for (const member of members) {
        await tx.smallGroupMemberRequest.create({
          data: {
            smallGroupId: groupId,
            memberId: member.id,
            fromGroupId: member.smallGroupId ?? null,
            assignedByUserId: actorId,
          },
        })
        await tx.smallGroupLog.create({
          data: {
            smallGroupId: groupId,
            action: "TempAssignmentCreated",
            memberId: member.id,
            fromGroupId: member.smallGroupId ?? null,
            toGroupId: groupId,
            performedByUserId: actorId,
            description: `${member.firstName} ${member.lastName} was assigned as part of a couple (pending leader confirmation)`,
          },
        })
      }
    })

    revalidatePath(`/small-groups/${groupId}`)
    revalidatePath("/small-groups")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to create couple request" }
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
    // Only a Catch Mech decline is groupless, and those are never Pending.
    if (!request.smallGroupId) return { success: false, error: "Request not found" }

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

export type RequestDecision = "approve" | "deny"

export type ResolveRequestsResult = {
  /** How many pending requests actually changed status. */
  resolved: number
  /** Rows left untouched, each with a reason the admin can act on. */
  failed: BatchFailure[]
}

const SKIP_REASON_COPY: Record<SkipReason, string> = {
  "not-pending": "already resolved",
  "wrong-group": "no longer targets this DGroup",
  "at-capacity": "the DGroup is at its member limit",
  "no-person": "has no linked person",
}

/**
 * Approve or deny pending DGroup requests **on the group leader's behalf**.
 *
 * The leader's own `/small-group-confirmation/[token]` form is the normal path,
 * but leaders go quiet and the queue stalls, so an admin needs an express way to
 * settle a request. It runs the same `resolveMemberRequest` the leader form does
 * — same promotion, same transfer, same audit lines — and only the attribution
 * differs: `performedByUserId` is the admin, and every log line says the decision
 * was made on the leader's behalf.
 *
 * One transaction per request rather than one for the batch: a single row that
 * can't be applied (a full group, a request someone else just resolved) should
 * cost the admin that row, not the other nineteen. Failures come back per row so
 * the UI can keep exactly those selected.
 */
export async function resolveMemberRequestsBatch(
  ids: string[],
  decision: RequestDecision
): Promise<ActionResult<ResolveRequestsResult>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (ids.length === 0) return { success: true, data: { resolved: 0, failed: [] } }

  try {
    const actorId = await getActorId()

    let resolved = 0
    const failed: BatchFailure[] = []
    const touchedGroupIds = new Set<string>()
    const touchedGuestIds = new Set<string>()
    const breakoutGroupIds = new Set<string>()

    // Deduped: `resolveMemberRequest` guards on the request's *current* status, so
    // the same id twice in one call would otherwise be read once and applied twice
    // — promoting the same guest into a second Member.
    for (const id of new Set(ids)) {
      try {
        const result = await db.$transaction(async (tx) => {
          // Read inside the transaction, never from a prefetch: the not-pending
          // guard is only honest if it sees the row as it stands right now.
          const request = await tx.smallGroupMemberRequest.findUnique({
            where: { id },
            select: {
              ...RESOLVABLE_REQUEST_SELECT,
              smallGroup: { select: { id: true, name: true, status: true, leaderId: true } },
            },
          })
          if (!request?.smallGroup) return null

          const outcome = await resolveMemberRequest(tx, {
            request,
            group: request.smallGroup,
            decision: decision === "approve" ? "confirmed" : "rejected",
            actor: {
              userId: actorId,
              // Attributed to the leader too: the decision is recorded as theirs,
              // made for them, so the group's own log still reads as one story.
              memberId: request.smallGroup.leaderId,
              byLabel: "by an admin on the group leader's behalf",
            },
          })
          // Only an existing Member can hold a satellite, and joining a DGroup
          // here supersedes it.
          if (outcome.outcome === "confirmed" && outcome.confirmedMemberId) {
            await clearUpwardSatelliteOnConfirm(tx, [outcome.confirmedMemberId])
          }
          return { outcome, request }
        })

        if (result === null) {
          failed.push({ id, name: "Unknown", reason: "no longer exists" })
          continue
        }

        const { outcome, request } = result
        if (outcome.outcome === "skipped") {
          failed.push({ id, name: personNameOf(request), reason: SKIP_REASON_COPY[outcome.reason] })
          continue
        }

        resolved++
        touchedGroupIds.add(request.smallGroup!.id)
        if (request.guestId) touchedGuestIds.add(request.guestId)
        if (request.fromGroupId) touchedGroupIds.add(request.fromGroupId)
        if (request.breakoutGroupId) breakoutGroupIds.add(request.breakoutGroupId)
      } catch {
        failed.push({ id, name: "Unknown", reason: "could not be updated" })
      }
    }

    revalidatePath("/small-groups")
    for (const groupId of touchedGroupIds) revalidatePath(`/small-groups/${groupId}`)
    if (touchedGuestIds.size > 0) {
      revalidatePath("/guests")
      revalidatePath("/members")
      for (const guestId of touchedGuestIds) revalidatePath(`/guests/${guestId}`)
    }
    // A request that came out of a breakout is still tracked on the event's Catch
    // Mech board, which would otherwise keep showing it as pending.
    if (breakoutGroupIds.size > 0) {
      const breakouts = await db.breakoutGroup.findMany({
        where: { id: { in: [...breakoutGroupIds] } },
        select: { eventId: true },
      })
      for (const eventId of new Set(breakouts.map((b) => b.eventId))) {
        revalidatePath(`/event/${eventId}/catch-mech`)
        revalidatePath(`/event/${eventId}/dashboard`)
      }
    }

    return { success: true, data: { resolved, failed } }
  } catch {
    return { success: false, error: "Failed to update requests" }
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

/**
 * Dismiss a seeker request — someone who asked to join a DGroup at registration
 * or check-in (CCF-101) but who the admin has decided not to place right now.
 *
 * Marks it Rejected rather than deleting, so the ask stays on the record and the
 * person doesn't silently vanish from the queue with no trace. No SmallGroupLog
 * entry: that table is scoped to a group, and a seeker has none.
 */
export async function dismissSeekerRequest(requestId: string): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const request = await db.smallGroupMemberRequest.findUnique({
      where: { id: requestId },
      select: { status: true, origin: true, smallGroupId: true },
    })
    if (!request) return { success: false, error: "Request not found" }
    if (request.origin !== "RegistrationIntent" || request.smallGroupId) {
      // Group-targeted requests are resolved by their leader, not dismissed here.
      return { success: false, error: "Request not found" }
    }
    if (request.status !== "Pending") {
      return { success: false, error: "This request has already been resolved" }
    }

    await db.smallGroupMemberRequest.update({
      where: { id: requestId },
      data: { status: "Rejected", resolvedAt: new Date() },
    })

    revalidatePath("/small-groups")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to dismiss request" }
  }
}

export type SmallGroupOption = {
  id: string
  name: string
  leaderName: string
  memberCount: number
  memberLimit: number | null
}

/**
 * Every DGroup, for pickers that need the whole list rather than a search.
 *
 * No query parameter on purpose: DGroups number in the dozens, and the combobox
 * that consumes this filters client-side. `memberCount`/`memberLimit` ride along
 * so a picker can show a group is full before the server rejects the placement.
 *
 * Read-only, so it checks `canRead` rather than `requireWrite` — the guest
 * promotion dialog is reachable by a Guests admin who cannot edit DGroups.
 */
export async function listSmallGroupOptions(): Promise<ActionResult<SmallGroupOption[]>> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Not authenticated." }
  if (!canRead(session, "SmallGroups")) return { success: false, error: "Unauthorized." }

  try {
    const groups = await db.smallGroup.findMany({
      select: {
        id: true,
        name: true,
        memberLimit: true,
        leader: { select: { firstName: true, lastName: true } },
        _count: { select: { members: true } },
      },
      orderBy: { name: "asc" },
    })

    return {
      success: true,
      data: groups.map((g) => ({
        id: g.id,
        name: g.name,
        leaderName: g.leader ? `${g.leader.firstName} ${g.leader.lastName}` : "",
        memberCount: g._count.members,
        memberLimit: g.memberLimit,
      })),
    }
  } catch {
    return { success: false, error: "Failed to load DGroups" }
  }
}
