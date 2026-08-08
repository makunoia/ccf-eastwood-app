import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"

async function getActorId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

// Resolves which small group should receive temporary membership when a
// registrant is assigned to a breakout group. Uses the breakout group's
// explicitly stored linkedSmallGroupId; falls back to auto-resolving only
// when the facilitator leads exactly one group (unambiguous).
async function resolveLinkedSmallGroup(
  breakoutGroupId: string
): Promise<{ smallGroupId: string; eventName: string } | null> {
  const bg = await db.breakoutGroup.findUnique({
    where: { id: breakoutGroupId },
    select: {
      linkedSmallGroupId: true,
      event: { select: { name: true } },
      facilitator: {
        select: { member: { select: { id: true } } },
      },
    },
  })
  if (!bg) return null

  const eventName = bg.event.name

  if (bg.linkedSmallGroupId) return { smallGroupId: bg.linkedSmallGroupId, eventName }

  // Fallback: auto-resolve only when facilitator leads exactly 1 group
  const facilitatorMemberId = bg.facilitator?.member?.id
  if (!facilitatorMemberId) return null

  const groups = await db.smallGroup.findMany({
    where: { leaderId: facilitatorMemberId },
    select: { id: true },
    take: 2,
  })
  return groups.length === 1 ? { smallGroupId: groups[0].id, eventName } : null
}

export async function tryCreateSmallGroupRequestFromBreakout(
  breakoutGroupId: string,
  registrantId: string
): Promise<void> {
  try {
    const resolved = await resolveLinkedSmallGroup(breakoutGroupId)
    if (!resolved) return
    const { smallGroupId, eventName } = resolved

    const registrant = await db.eventRegistrant.findUnique({
      where: { id: registrantId },
      select: {
        memberId: true,
        guestId: true,
        member: { select: { firstName: true, lastName: true, smallGroupId: true } },
        guest:  { select: { firstName: true, lastName: true, memberId: true } },
      },
    })
    if (!registrant) return
    if (!registrant.memberId && !registrant.guestId) return // anonymous — skip

    const actorId = await getActorId()

    if (registrant.guestId && registrant.guest) {
      if (registrant.guest.memberId) return // already promoted to member
      const existing = await db.smallGroupMemberRequest.findFirst({
        where: { smallGroupId, guestId: registrant.guestId, status: "Pending" },
      })
      if (existing) return
      await db.$transaction([
        db.smallGroupMemberRequest.create({
          data: {
            smallGroupId,
            guestId: registrant.guestId,
            assignedByUserId: actorId,
            breakoutGroupId,
          },
        }),
        db.smallGroupLog.create({
          data: {
            smallGroupId,
            action: "TempAssignmentCreated",
            guestId: registrant.guestId,
            performedByUserId: actorId,
            description: `${registrant.guest.firstName} ${registrant.guest.lastName} was temporarily assigned to the group via ${eventName} breakout placement (pending leader confirmation)`,
          },
        }),
      ])
    } else if (registrant.memberId && registrant.member) {
      if (registrant.member.smallGroupId) return // already in a small group — not tracked by catch mech
      const existing = await db.smallGroupMemberRequest.findFirst({
        where: { smallGroupId, memberId: registrant.memberId, status: "Pending" },
      })
      if (existing) return
      await db.$transaction([
        db.smallGroupMemberRequest.create({
          data: {
            smallGroupId,
            memberId: registrant.memberId,
            fromGroupId: registrant.member.smallGroupId ?? null,
            assignedByUserId: actorId,
            breakoutGroupId,
          },
        }),
        db.smallGroupLog.create({
          data: {
            smallGroupId,
            action: "TempAssignmentCreated",
            memberId: registrant.memberId,
            fromGroupId: registrant.member.smallGroupId ?? null,
            toGroupId: smallGroupId,
            performedByUserId: actorId,
            description: `${registrant.member.firstName} ${registrant.member.lastName} was temporarily assigned for transfer to this group via ${eventName} breakout placement (pending leader confirmation)`,
          },
        }),
      ])
    }

    revalidatePath(`/small-groups/${smallGroupId}`)
  } catch {
    // Never propagate — breakout assignment must not be blocked
  }
}

/**
 * Keep a Catch Mech request attached to the right breakout group when a
 * registrant is moved between groups (CCF-139).
 *
 * `SmallGroupMemberRequest.breakoutGroupId` is what the Catch Mech admin pages,
 * the per-group aggregate counts and the dashboard pipeline chart attribute a
 * person by, so leaving it pointing at the old group mis-files them.
 *
 * When both breakout groups feed the *same* DGroup the pending request is still
 * entirely correct — only its attribution is stale. Re-pointing it beats
 * cancel-then-recreate there: the latter would emit a bogus
 * `TempAssignmentRejected` log entry the leader can see, and reset the request's
 * `createdAt` so it looks newly raised. When the DGroups differ (or one side has
 * none) the old request genuinely is wrong and cancel + create is right.
 */
export async function tryTransferSmallGroupRequestFromBreakout(
  fromGroupId: string,
  toGroupId: string,
  registrantId: string
): Promise<void> {
  try {
    const [from, to] = await Promise.all([
      resolveLinkedSmallGroup(fromGroupId),
      resolveLinkedSmallGroup(toGroupId),
    ])

    if (!from || !to || from.smallGroupId !== to.smallGroupId) {
      await tryCancelSmallGroupRequestFromBreakout(fromGroupId, registrantId)
      await tryCreateSmallGroupRequestFromBreakout(toGroupId, registrantId)
      return
    }

    const registrant = await db.eventRegistrant.findUnique({
      where: { id: registrantId },
      select: { memberId: true, guestId: true },
    })
    if (!registrant) return
    if (!registrant.memberId && !registrant.guestId) return // anonymous — nothing tracked

    // updateMany, not update: `breakoutGroupId` is a bare scalar with no unique
    // constraint, so this where-clause doesn't identify a single row.
    await db.smallGroupMemberRequest.updateMany({
      where: {
        breakoutGroupId: fromGroupId,
        status: "Pending",
        ...(registrant.memberId
          ? { memberId: registrant.memberId }
          : { guestId: registrant.guestId! }),
      },
      data: { breakoutGroupId: toGroupId },
    })

    revalidatePath(`/small-groups/${from.smallGroupId}`)
  } catch {
    // Never propagate — the placement has already committed
  }
}

export async function tryCancelSmallGroupRequestFromBreakout(
  breakoutGroupId: string,
  registrantId: string
): Promise<void> {
  try {
    const registrant = await db.eventRegistrant.findUnique({
      where: { id: registrantId },
      select: { memberId: true, guestId: true },
    })
    if (!registrant) return
    if (!registrant.memberId && !registrant.guestId) return

    const [request, bg] = await Promise.all([
      db.smallGroupMemberRequest.findFirst({
        where: {
          breakoutGroupId,
          status: "Pending",
          ...(registrant.memberId
            ? { memberId: registrant.memberId }
            : { guestId: registrant.guestId! }),
        },
        select: {
          id: true,
          smallGroupId: true,
          guestId: true,
          memberId: true,
          guest:  { select: { firstName: true, lastName: true } },
          member: { select: { firstName: true, lastName: true } },
        },
      }),
      db.breakoutGroup.findUnique({
        where: { id: breakoutGroupId },
        select: { event: { select: { name: true } } },
      }),
    ])
    // Only a Catch Mech decline is groupless, and those are never Pending.
    if (!request?.smallGroupId) return

    const personName = request.guest
      ? `${request.guest.firstName} ${request.guest.lastName}`
      : request.member
        ? `${request.member.firstName} ${request.member.lastName}`
        : "Unknown"

    const eventName = bg?.event?.name

    await db.$transaction([
      db.smallGroupMemberRequest.update({
        where: { id: request.id },
        data: { status: "Rejected", resolvedAt: new Date() },
      }),
      db.smallGroupLog.create({
        data: {
          smallGroupId: request.smallGroupId,
          action: "TempAssignmentRejected",
          guestId: request.guestId ?? null,
          memberId: request.memberId ?? null,
          description: `Temporary assignment for ${personName} was cancelled — removed from ${eventName ? `${eventName} ` : ''}breakout`,
        },
      }),
    ])

    revalidatePath(`/small-groups/${request.smallGroupId}`)
  } catch {
    // Never propagate
  }
}
