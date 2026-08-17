import "server-only"

import { db } from "@/lib/db"
import { isClusterOwner, type BreakoutOwner } from "./owner"

/**
 * Whose registrants an owner's breakout tables may seat.
 *
 * An event-owned table seats that event's registrants — one id, the way it has
 * always been. A cluster-owned table seats the registrants of every member event
 * of the cluster, because a collab's attendees hold a registration on each of
 * them (the shared form fans out to all).
 *
 * Kept separate from {@link BreakoutOwner} because the two are different
 * questions that only happen to have related answers: the owner says *which
 * tables exist*, this says *who may sit at them*. Under a Collab those diverge
 * completely — the tables belong to no event at all.
 */
export async function breakoutCandidateEventIds(
  owner: BreakoutOwner
): Promise<string[]> {
  if (!isClusterOwner(owner)) return [owner.eventId]
  const links = await db.eventClusterEvent.findMany({
    where: { clusterId: owner.clusterId },
    select: { eventId: true },
  })
  return links.map((l) => l.eventId)
}
