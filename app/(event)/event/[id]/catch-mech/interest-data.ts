import { db } from "@/lib/db"
import type { InterestRow } from "./interest-tracker"

/** Event-scoped history follows an interest request even after placement. */
export async function loadEventInterests(eventId: string): Promise<InterestRow[]> {
  const requests = await db.smallGroupMemberRequest.findMany({
    where: { sourceEventId: eventId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      status: true,
      smallGroupId: true,
      smallGroup: { select: { name: true } },
      member: { select: { id: true, firstName: true, lastName: true } },
      guest: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  return requests.flatMap((request) => {
    const person = request.member ?? request.guest
    if (!person) return []
    return [{
      id: request.id,
      createdAt: request.createdAt,
      personId: person.id,
      personName: `${person.firstName} ${person.lastName}`,
      personType: request.member ? "Member" as const : "Guest" as const,
      status: request.status,
      groupId: request.smallGroupId,
      groupName: request.smallGroup?.name ?? null,
    }]
  })
}
