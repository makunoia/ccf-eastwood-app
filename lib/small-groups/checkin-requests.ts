import type { Prisma } from "@/app/generated/prisma/client"

export type CheckinRequestPerson = { guestId: string } | { memberId: string }

/** A breakout decision is provisional until its DGroup request is confirmed. */
export async function cancelPendingBreakoutRequests(
  tx: Prisma.TransactionClient,
  person: CheckinRequestPerson,
  description: string,
  keepGroupId?: string
): Promise<string[]> {
  const requests = await tx.smallGroupMemberRequest.findMany({
    where: {
      ...person,
      status: "Pending",
      resolvedAt: null,
      breakoutGroupId: { not: null },
      ...(keepGroupId ? { smallGroupId: { not: keepGroupId } } : {}),
    },
    select: { id: true, smallGroupId: true },
  })

  const changedGroups = new Set<string>()
  for (const request of requests) {
    // A facilitator or admin may have resolved the request since the kiosk
    // loaded. Record a cancellation only when this update actually wins.
    const updated = await tx.smallGroupMemberRequest.updateMany({
      where: { id: request.id, status: "Pending", resolvedAt: null },
      data: { status: "Rejected", resolvedAt: new Date(), registrantCancelledAt: new Date() },
    })
    if (updated.count === 0 || !request.smallGroupId) continue
    changedGroups.add(request.smallGroupId)
    await tx.smallGroupLog.create({
      data: {
        smallGroupId: request.smallGroupId,
        action: "TempAssignmentRejected",
        guestId: "guestId" in person ? person.guestId : null,
        memberId: "memberId" in person ? person.memberId : null,
        description,
      },
    })
  }
  return [...changedGroups]
}
