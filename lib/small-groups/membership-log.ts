/**
 * The one place that knows what a membership change looks like in a group's log.
 *
 * A member belongs to at most one DGroup, so every placement is really two events:
 * someone joins one group and, if they were already in another, leaves that one.
 * Six call sites wrote only the arriving half — the admin add-member action, the
 * couples add, both leader auto-placements in the DGroup form, the couples
 * confirmation, and member deletion — which left the origin group's history
 * showing a roster that shrank for no recorded reason.
 *
 * It also owns the two changes that had no enum value at all until now — a group
 * changing leader, and a member's standing moving between Member / Timothy /
 * Leader — so every kind of entry a group's history can hold is written here.
 *
 * Not a `"use server"` module: it is an internal helper, and everything exported
 * from a `"use server"` file becomes a callable endpoint.
 */

import type { MemberGroupStatus } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

/**
 * Who performed the change. Dashboard writes carry a `User`; the public token
 * flows (group leaders, Catch Mech facilitators) never log in and carry a
 * `Member` instead. `SmallGroupLog` holds both columns for exactly this reason.
 */
export type LogActor = {
  userId?: string | null
  memberId?: string | null
}

export type MembershipMove = {
  memberId: string
  /** Rendered into `description`, which is the only part that survives the member being deleted. */
  memberName: string
  /** Where they were before the change — null when they were in no group. */
  fromGroupId: string | null
  /** Where they are after it — null when they are being removed or deleted. */
  toGroupId: string | null
  actor?: LogActor
  /**
   * Why it happened, appended to every description this move writes — e.g.
   * `"(couple)"` or `"as the leader of Group B"`. Kept as caller-supplied prose
   * because the reason is the part a human reading the trail actually needs.
   */
  context?: string
}

/**
 * Writes the log entries for one membership change — and nothing else. The
 * `member.update` stays with the caller: the call sites scope their updates
 * differently (one is an `updateMany` guarded on the old group so a hand-picked
 * placement is never clobbered), and folding that in would flatten a distinction
 * that is load-bearing.
 *
 * - both groups set     → `MemberTransferred` in each, so neither side's history has a hole
 * - arriving only       → `MemberAdded`
 * - leaving only        → `MemberRemoved`
 * - same group, or none → nothing; a no-op move is not an event
 */
export async function logMembershipMove(
  tx: TxClient,
  move: MembershipMove
): Promise<void> {
  const { memberId, memberName, fromGroupId, toGroupId, actor, context } = move

  // Re-adding someone to the group they are already in changes nothing, and the
  // add-member picker does not stop an admin from trying.
  if (fromGroupId === toGroupId) return

  const suffix = context ? ` ${context}` : ""
  const performedByUserId = actor?.userId ?? null
  const performedByMemberId = actor?.memberId ?? null

  if (fromGroupId && toGroupId) {
    await tx.smallGroupLog.createMany({
      data: [
        {
          smallGroupId: toGroupId,
          action: "MemberTransferred",
          memberId,
          fromGroupId,
          toGroupId,
          performedByUserId,
          performedByMemberId,
          description: `${memberName} transferred into this group${suffix}`,
        },
        {
          smallGroupId: fromGroupId,
          action: "MemberTransferred",
          memberId,
          fromGroupId,
          toGroupId,
          performedByUserId,
          performedByMemberId,
          description: `${memberName} transferred out of this group${suffix}`,
        },
      ],
    })
    return
  }

  if (toGroupId) {
    await tx.smallGroupLog.create({
      data: {
        smallGroupId: toGroupId,
        action: "MemberAdded",
        memberId,
        performedByUserId,
        performedByMemberId,
        description: `${memberName} was added to the group${suffix}`,
      },
    })
    return
  }

  if (fromGroupId) {
    await tx.smallGroupLog.create({
      data: {
        smallGroupId: fromGroupId,
        action: "MemberRemoved",
        memberId,
        performedByUserId,
        performedByMemberId,
        description: `${memberName} was removed from the group${suffix}`,
      },
    })
  }
}

export type LeaderChange = {
  smallGroupId: string
  /** The incoming leader — recorded as the entry's subject. */
  toLeaderId: string
  toLeaderName: string
  /** The outgoing leader, or null when the group is only now getting one. */
  fromLeaderId: string | null
  fromLeaderName: string | null
  actor?: LogActor
  context?: string
}

/**
 * Records a group changing hands.
 *
 * Both names go into `description` rather than being left to the `memberId` /
 * `fromGroupId` columns: the outgoing leader has no column to live in, and a
 * member who is later deleted takes their `memberId` link with them
 * (`ON DELETE SET NULL`) while the sentence survives.
 *
 * A no-op change writes nothing, so re-saving the DGroup form without touching
 * the leader field doesn't pad the trail.
 */
export async function logLeaderChange(
  tx: TxClient,
  change: LeaderChange
): Promise<void> {
  const { smallGroupId, toLeaderId, toLeaderName, fromLeaderId, fromLeaderName } = change
  if (fromLeaderId === toLeaderId) return

  const suffix = change.context ? ` ${change.context}` : ""
  const description = fromLeaderName
    ? `${toLeaderName} took over as leader from ${fromLeaderName}${suffix}`
    : `${toLeaderName} became the leader${suffix}`

  await tx.smallGroupLog.create({
    data: {
      smallGroupId,
      action: "LeaderChanged",
      memberId: toLeaderId,
      performedByUserId: change.actor?.userId ?? null,
      performedByMemberId: change.actor?.memberId ?? null,
      description,
    },
  })
}

export type GroupStatusChange = {
  smallGroupId: string
  memberId: string
  memberName: string
  /** null when they had no standing recorded yet. */
  from: MemberGroupStatus | null
  to: MemberGroupStatus
  actor?: LogActor
}

/**
 * Records a member's standing within their group moving between Member, Timothy
 * and Leader — the discipleship progression the group's history is meant to show.
 */
export async function logGroupStatusChange(
  tx: TxClient,
  change: GroupStatusChange
): Promise<void> {
  const { smallGroupId, memberId, memberName, from, to } = change
  if (from === to) return

  await tx.smallGroupLog.create({
    data: {
      smallGroupId,
      action: "MemberStatusChanged",
      memberId,
      performedByUserId: change.actor?.userId ?? null,
      performedByMemberId: change.actor?.memberId ?? null,
      description: from
        ? `${memberName} changed from ${from} to ${to}`
        : `${memberName} was set to ${to}`,
    },
  })
}
