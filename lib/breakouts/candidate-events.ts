import "server-only"

import { db } from "@/lib/db"
import { ClusterKind, type Prisma } from "@/app/generated/prisma/client"
import { clusterDayRegistrantWhere } from "@/lib/clusters/day-registration"
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

/**
 * The candidate pool as a `where` clause: whose registrations may be seated at
 * this owner's tables *today*.
 *
 * An event-owned table asks only "is this my registrant" — one event, one
 * answer, exactly as {@link breakoutCandidateEventIds} always said.
 *
 * A **Collab** cluster's tables ask a second question, and it is the one that
 * makes the day workable. `EventRegistrant` is one row per person per event
 * series, so "registrants of the day's member events" is both ministries' entire
 * standing rosters — hundreds of people who are not at this session. Seating
 * from that list is guesswork, and the "N unassigned" figure it produces is
 * meaningless. The day's own registrations are the pool, by the same rule every
 * other cluster surface reads (`clusterDayRegistrantWhere`).
 *
 * A Parallel cluster is untouched: its member events keep their own tables and
 * their own registrations, and nothing about them is shared.
 */
export async function breakoutCandidateWhere(
  owner: BreakoutOwner
): Promise<Prisma.EventRegistrantWhereInput> {
  const eventIds = await breakoutCandidateEventIds(owner)
  if (!isClusterOwner(owner)) return { eventId: { in: eventIds } }

  const cluster = await db.eventCluster.findUnique({
    where: { id: owner.clusterId },
    select: {
      kind: true,
      date: true,
      events: { select: { occurrenceId: true } },
    },
  })
  if (!cluster || cluster.kind !== ClusterKind.Collab) {
    return { eventId: { in: eventIds } }
  }
  return {
    eventId: { in: eventIds },
    ...clusterDayRegistrantWhere({
      clusterId: owner.clusterId,
      date: cluster.date,
      linkedOccurrenceIds: cluster.events
        .map((e) => e.occurrenceId)
        .filter((id): id is string => id !== null),
    }),
  }
}
