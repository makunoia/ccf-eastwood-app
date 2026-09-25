import type { Prisma } from "@/app/generated/prisma/client"
import { revalidatePath } from "next/cache"

export type InterestPerson = { guestId: string } | { memberId: string }

/** Convert an unplaced interest in the same transaction as the placement. */
export async function advancePendingInterest(
  tx: Prisma.TransactionClient,
  options: {
    person: InterestPerson
    groupId: string
    status: "Pending" | "Confirmed"
    actorId: string | null
    fromGroupId?: string | null
    promotedMemberId?: string
    requestId?: string
  }
): Promise<{ id: string; sourceEventId: string | null } | null> {
  const requests = await tx.smallGroupMemberRequest.findMany({
    where: {
      ...options.person,
      ...(options.requestId ? { id: options.requestId } : {}),
      origin: "RegistrationIntent",
      status: "Pending",
      smallGroupId: null,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 2,
    select: { id: true, sourceEventId: true },
  })
  if (requests.length === 0) {
    if (options.requestId) throw new Error("This interest request has already changed.")
    const alreadyAssigned = await tx.smallGroupMemberRequest.findMany({
      where: {
        ...options.person,
        sourceEventId: { not: null },
        origin: "Assignment",
        status: "Pending",
        smallGroupId: { not: null },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 2,
      select: { id: true, sourceEventId: true, smallGroupId: true },
    })
    if (alreadyAssigned.length > 1) throw new Error("This person has duplicate open DGroup interests. Resolve them before assigning.")
    const targeted = alreadyAssigned[0]
    if (targeted?.smallGroupId) {
      if (options.status === "Pending" && targeted.smallGroupId === options.groupId) {
        throw new Error("This event DGroup interest is already awaiting leader confirmation.")
      }
      const updated = await tx.smallGroupMemberRequest.updateMany({
        where: { id: targeted.id, status: "Pending", smallGroupId: targeted.smallGroupId },
        data: {
          smallGroupId: options.groupId,
          status: options.status,
          resolvedAt: options.status === "Confirmed" ? new Date() : null,
          assignedByUserId: options.actorId,
          fromGroupId: options.fromGroupId ?? null,
          ...(options.promotedMemberId ? { memberId: options.promotedMemberId, guestId: null } : {}),
        },
      })
      if (updated.count !== 1) throw new Error("This interest request has already changed.")
      if (targeted.smallGroupId !== options.groupId) {
        await tx.smallGroupLog.create({
          data: {
            smallGroupId: targeted.smallGroupId,
            action: "TempAssignmentRejected",
            ...options.person,
            performedByUserId: options.actorId,
            description: "Pending event DGroup assignment was superseded by a staff assignment to another DGroup before leader confirmation",
          },
        })
      }
      return { id: targeted.id, sourceEventId: targeted.sourceEventId }
    }
    return null
  }
  if (requests.length > 1) {
    throw new Error("This person has duplicate open DGroup interests. Resolve them before assigning.")
  }

  const request = requests[0]
  const updated = await tx.smallGroupMemberRequest.updateMany({
    where: { id: request.id, origin: "RegistrationIntent", status: "Pending", smallGroupId: null },
    data: {
      smallGroupId: options.groupId,
      origin: "Assignment",
      status: options.status,
      resolvedAt: options.status === "Confirmed" ? new Date() : null,
      assignedByUserId: options.actorId,
      fromGroupId: options.fromGroupId ?? null,
      ...(options.promotedMemberId ? { memberId: options.promotedMemberId, guestId: null } : {}),
    },
  })
  if (updated.count !== 1) throw new Error("This interest request has already changed.")
  return request
}

export function revalidateInterestEvents(eventIds: Iterable<string | null | undefined>): void {
  for (const eventId of new Set([...eventIds].filter((id): id is string => Boolean(id)))) {
    revalidatePath(`/event/${eventId}/catch-mech`, "layout")
  }
}
