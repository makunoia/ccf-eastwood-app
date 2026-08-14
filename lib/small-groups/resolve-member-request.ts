/**
 * Resolving one pending `SmallGroupMemberRequest` — confirm it or decline it.
 *
 * Two surfaces do this and they must not drift: the group leader answering their
 * `/small-group-confirmation/[token]` form, and an admin doing it *on the
 * leader's behalf* from the DGroups → Requests table. The work is identical —
 * promote a guest, move a transferring member, write the audit lines, mark the
 * request resolved — and the only real differences are who gets attributed and
 * what the log line says. Those are parameters, not a second copy of the logic.
 *
 * Deliberately NOT a `"use server"` module: the leader flow authenticates by
 * token, and everything exported from a `"use server"` file becomes a callable
 * endpoint. These are internal helpers — both callers are already server-side.
 *
 * What stays with the callers: permission/token checks, `revalidatePath`,
 * `clearUpwardSatelliteOnConfirm` (batched over the whole submission), the
 * `ConfirmationSubmission` row, and any per-surface reporting of skips.
 */

import type { Prisma, SmallGroupStatus } from "@/app/generated/prisma/client"
import {
  PROMOTABLE_GUEST_SELECT,
  assertGroupCapacity,
  promoteGuestRecord,
} from "@/lib/people/promote-guest"

/**
 * Every column {@link resolveMemberRequest} reads off the request. Callers select
 * exactly this so a new column can't be picked up by one surface and dropped by
 * the other.
 */
export const RESOLVABLE_REQUEST_SELECT = {
  id: true,
  smallGroupId: true,
  guestId: true,
  memberId: true,
  fromGroupId: true,
  breakoutGroupId: true,
  status: true,
  guest: { select: PROMOTABLE_GUEST_SELECT },
  member: { select: { firstName: true, lastName: true } },
} satisfies Prisma.SmallGroupMemberRequestSelect

export type ResolvableRequest = Prisma.SmallGroupMemberRequestGetPayload<{
  select: typeof RESOLVABLE_REQUEST_SELECT
}>

/** The target group. `status` is read so a Pending group can be woken on confirm. */
export type ResolutionGroup = {
  id: string
  name: string
  status: SmallGroupStatus
  leaderId: string | null
}

export type ResolutionActor = {
  /** The leader, when a Member answered. Written to `SmallGroupLog.performedByMemberId`. */
  memberId?: string | null
  /** The signed-in admin, when one acted on the leader's behalf. */
  userId?: string | null
  /**
   * Trailing clause on every log description — "by the group leader", or
   * "by an admin on the group leader's behalf".
   */
  byLabel: string
}

export type SkipReason =
  /** Already Confirmed/Rejected — a second submission, or someone else got there first. */
  | "not-pending"
  /** The request doesn't belong to the group the caller resolved it against. */
  | "wrong-group"
  /** Confirming would push the group past its `memberLimit`. */
  | "at-capacity"
  /** Neither `guestId` nor `memberId` is set, so there is nobody to place. */
  | "no-person"

export type RequestResolution =
  | { outcome: "skipped"; reason: SkipReason }
  | {
      outcome: "confirmed"
      /** Set when a Guest was promoted (or an existing Member reused) by this call. */
      promotedMemberId: string | null
      /**
       * Set when an *existing* Member was placed. Only these can hold an upward
       * satellite — a freshly promoted guest is a new Member who leads nothing —
       * so this is what callers batch into `clearUpwardSatelliteOnConfirm`.
       */
      confirmedMemberId: string | null
    }
  | { outcome: "rejected" }

export type ResolveMemberRequestArgs = {
  request: ResolvableRequest
  group: ResolutionGroup
  decision: "confirmed" | "rejected"
  actor: ResolutionActor
  /**
   * Stored on the resolved request. `undefined` leaves the existing notes alone;
   * `null` clears them. The leader form passes its per-row note (or null) because
   * that form owns the field; the admin batch leaves it untouched.
   */
  notes?: string | null
  /**
   * Appended to every log description, e.g. `" via Catch Mech Link of Summer Camp"`.
   * Callers resolve the event name in bulk before opening the transaction.
   */
  contextSuffix?: string
  /**
   * When true, a confirm that would exceed the group's `memberLimit` is skipped
   * rather than applied. Both current callers enforce it; the Catch Mech faci
   * form deliberately does not, and has its own resolver.
   */
  enforceCapacity?: boolean
}

export function personNameOf(request: ResolvableRequest): string {
  const person = request.member ?? request.guest
  return person ? `${person.firstName} ${person.lastName}` : "Unknown"
}

/**
 * Applies one decision inside a transaction the caller owns.
 *
 * Returns a `skipped` outcome rather than throwing for the ordinary races — an
 * already-resolved request, a full group. The leader form ignores those silently
 * (it re-renders from the DB anyway); the admin batch reports them per row.
 */
export async function resolveMemberRequest(
  tx: Prisma.TransactionClient,
  {
    request,
    group,
    decision,
    actor,
    notes,
    contextSuffix = "",
    enforceCapacity = true,
  }: ResolveMemberRequestArgs
): Promise<RequestResolution> {
  if (request.status !== "Pending") return { outcome: "skipped", reason: "not-pending" }
  if (request.smallGroupId !== group.id) return { outcome: "skipped", reason: "wrong-group" }
  if (!request.guestId && !request.memberId) return { outcome: "skipped", reason: "no-person" }

  const now = new Date()
  const performedBy = {
    performedByMemberId: actor.memberId ?? null,
    performedByUserId: actor.userId ?? null,
  }
  /** Only set when the notes column should actually be written. */
  const notesPatch = notes === undefined ? {} : { notes }

  // ── Decline ────────────────────────────────────────────────────────────────
  if (decision === "rejected") {
    await tx.smallGroupLog.create({
      data: {
        smallGroupId: group.id,
        action: "TempAssignmentRejected",
        guestId: request.guestId ?? null,
        memberId: request.memberId ?? null,
        ...performedBy,
        description: `${personNameOf(request)}'s membership was declined ${actor.byLabel}${contextSuffix}`,
      },
    })
    await tx.smallGroupMemberRequest.update({
      where: { id: request.id },
      data: { status: "Rejected", resolvedAt: now, ...notesPatch },
    })
    return { outcome: "rejected" }
  }

  // ── Confirm ────────────────────────────────────────────────────────────────
  let promotedMemberId: string | null = null
  let confirmedMemberId: string | null = null

  if (request.guestId && request.guest) {
    const guest = request.guest

    if (guest.memberId) {
      // Promoted out from under us by another surface — nothing to create, but the
      // request still has to stop being pending and point at the Member.
      promotedMemberId = guest.memberId
    } else {
      if (enforceCapacity && (await assertGroupCapacity(tx, group.id))) {
        return { outcome: "skipped", reason: "at-capacity" }
      }

      // `reuseExistingMemberByEmail` keeps a confirmation from hitting a P2002 on
      // the unique `Member.email` when the person already exists as a Member.
      const { memberId } = await promoteGuestRecord(tx, {
        guestId: request.guestId,
        guest,
        dateJoined: now,
        group,
        reuseExistingMemberByEmail: true,
        schedule: "normalized",
      })
      promotedMemberId = memberId

      await tx.smallGroupLog.createMany({
        data: [
          {
            smallGroupId: group.id,
            action: "TempAssignmentConfirmed",
            guestId: request.guestId,
            memberId,
            ...performedBy,
            description: `${guest.firstName} ${guest.lastName} was confirmed ${actor.byLabel}${contextSuffix} and promoted to member`,
          },
          {
            smallGroupId: group.id,
            action: "MemberAdded",
            memberId,
            ...performedBy,
            description: `${guest.firstName} ${guest.lastName} joined the group${contextSuffix}`,
          },
        ],
      })
    }
  } else if (request.memberId && request.member) {
    if (enforceCapacity && (await assertGroupCapacity(tx, group.id))) {
      return { outcome: "skipped", reason: "at-capacity" }
    }

    const memberName = `${request.member.firstName} ${request.member.lastName}`
    await tx.member.update({
      where: { id: request.memberId },
      data: { smallGroupId: group.id, groupStatus: "Member" },
    })
    confirmedMemberId = request.memberId

    await tx.smallGroupLog.createMany({
      data: [
        {
          smallGroupId: group.id,
          action: "TempAssignmentConfirmed",
          memberId: request.memberId,
          fromGroupId: request.fromGroupId ?? null,
          toGroupId: group.id,
          ...performedBy,
          description: `${memberName}'s transfer was confirmed ${actor.byLabel}${contextSuffix}`,
        },
        {
          smallGroupId: group.id,
          action: "MemberTransferred",
          memberId: request.memberId,
          fromGroupId: request.fromGroupId ?? null,
          toGroupId: group.id,
          ...performedBy,
          description: `${memberName} transferred into this group${contextSuffix}`,
        },
        // The old group gets its own line so the move is visible from both sides.
        ...(request.fromGroupId
          ? [
              {
                smallGroupId: request.fromGroupId,
                action: "MemberTransferred" as const,
                memberId: request.memberId,
                fromGroupId: request.fromGroupId,
                toGroupId: group.id,
                ...performedBy,
                description: `${memberName} transferred out of this group`,
              },
            ]
          : []),
      ],
    })
  }

  await tx.smallGroupMemberRequest.update({
    where: { id: request.id },
    data: {
      status: "Confirmed",
      resolvedAt: now,
      ...notesPatch,
      // Repoint the request at the new Member so downstream screens (the Catch
      // Mech admin page especially) can still find it by person.
      ...(request.guestId && promotedMemberId
        ? { memberId: promotedMemberId, guestId: null }
        : {}),
    },
  })

  // A group's first confirmed member is what makes it real. `promoteGuestRecord`
  // already does this on its own path; this covers the transfer branch and the
  // already-promoted-guest branch.
  if (group.status === "Pending") {
    await tx.smallGroup.update({ where: { id: group.id }, data: { status: "Active" } })
  }

  return { outcome: "confirmed", promotedMemberId, confirmedMemberId }
}
