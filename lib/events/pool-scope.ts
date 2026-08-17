import "server-only"

import { cache } from "react"
import type { Session } from "next-auth"
import { db } from "@/lib/db"
import { canAccessEvent } from "@/lib/permissions"
import { ClusterKind } from "@/app/generated/prisma/client"
import type { BreakoutOwner } from "@/lib/breakouts/owner"

/**
 * Pool scope (CCF-148) — how wide the volunteer roster and the breakout tables
 * reach for a given event.
 *
 * This is the staffing-side counterpart of `lib/events/registration-core.ts`.
 * Nearly every breakout and volunteer query used to scope on a bare `eventId`,
 * which is correct until two ministries co-run one event. Rather than teach
 * thirty call sites about clusters, each of them asks this module for a scope and
 * uses what it gets back.
 *
 * The two halves are deliberately asymmetric, because the two things are:
 *
 *  - **Volunteers pool as a union.** Someone genuinely signed up to serve under
 *    one ministry's event, and a collab wants both rosters as one list. The rows
 *    stay owned by their event.
 *  - **Breakouts pool as a new set.** A table for a collab session belongs to the
 *    session, so the cluster owns its own, and the member events' standing tables
 *    sit untouched and unused for the day. That is what makes "reset per session"
 *    true, and it is why this returns an OWNER for the group side and a LIST for
 *    the candidate side: which tables exist is one question, who may be seated in
 *    them is another.
 *
 * Outside a Collab cluster every field degenerates to the single event, so a
 * rewritten query behaves exactly as it did before this module existed.
 */
export type PoolScope = {
  eventId: string
  clusterId: string | null
  clusterName: string | null
  kind: ClusterKind | null
  /** Events whose volunteers read as one roster. `[eventId]` unless Collab. */
  volunteerEventIds: string[]
  /** Who owns the breakout tables in play. The cluster under Collab, else the event. */
  breakoutOwner: BreakoutOwner
  /** Whose registrants may be seated in them. `[eventId]` unless Collab. */
  candidateEventIds: string[]
}

/**
 * The cluster membership a scope is derived from. Narrow on purpose so the pure
 * helpers below can be unit-tested without a database.
 */
export type ClusterLink = {
  clusterId: string
  clusterName: string
  kind: ClusterKind
  memberEventIds: string[]
}

// ─── Pure derivation ─────────────────────────────────────────────────────────
//
// Exported for tests. Every branch here is "is this a Collab cluster", and the
// answer for a Parallel cluster is deliberately identical to the answer for no
// cluster at all — a Parallel day is several independent events that happen to
// share a date, and nothing about its staffing is shared.

export function isPooled(link: ClusterLink | null): boolean {
  return link !== null && link.kind === ClusterKind.Collab
}

/** Which events' rows a pooled read may span. */
export function poolEventIdsFor(eventId: string, link: ClusterLink | null): string[] {
  if (!isPooled(link)) return [eventId]
  // The member list already contains this event; guard anyway so a malformed
  // link can never produce a scope that excludes the event being asked about.
  const ids = link!.memberEventIds
  return ids.includes(eventId) ? ids : [eventId, ...ids]
}

/** Who owns the breakout tables for this event's day. */
export function breakoutOwnerFor(eventId: string, link: ClusterLink | null): BreakoutOwner {
  return isPooled(link) ? { clusterId: link!.clusterId } : { eventId }
}

export function poolScopeFor(eventId: string, link: ClusterLink | null): PoolScope {
  const ids = poolEventIdsFor(eventId, link)
  return {
    eventId,
    clusterId: link?.clusterId ?? null,
    clusterName: link?.clusterName ?? null,
    kind: link?.kind ?? null,
    volunteerEventIds: ids,
    breakoutOwner: breakoutOwnerFor(eventId, link),
    candidateEventIds: ids,
  }
}

// ─── DB-aware resolution ─────────────────────────────────────────────────────

const SELECT_LINK = {
  clusterId: true,
  cluster: {
    select: {
      id: true,
      name: true,
      kind: true,
      events: { orderBy: { order: "asc" as const }, select: { eventId: true } },
    },
  },
} as const

/**
 * One round trip, cached per request: a page loader that needs the scope in two
 * places pays for it once. `EventClusterEvent` is unique on `eventId` ("one
 * cluster per event"), so this is a point read.
 */
const loadLink = cache(async (eventId: string): Promise<ClusterLink | null> => {
  const row = await db.eventClusterEvent.findUnique({
    where: { eventId },
    select: SELECT_LINK,
  })
  if (!row?.cluster) return null
  return {
    clusterId: row.cluster.id,
    clusterName: row.cluster.name,
    kind: row.cluster.kind,
    memberEventIds: row.cluster.events.map((e) => e.eventId),
  }
})

const loadClusterLink = cache(async (clusterId: string): Promise<ClusterLink | null> => {
  const cluster = await db.eventCluster.findUnique({
    where: { id: clusterId },
    select: {
      id: true,
      name: true,
      kind: true,
      events: { orderBy: { order: "asc" }, select: { eventId: true } },
    },
  })
  if (!cluster) return null
  return {
    clusterId: cluster.id,
    clusterName: cluster.name,
    kind: cluster.kind,
    memberEventIds: cluster.events.map((e) => e.eventId),
  }
})

/**
 * The scope for an event, unfiltered by permission.
 *
 * For the public paths that have no session by design — auto-assign on check-in,
 * the registration and walk-in breakout pickers, the check-in success screen.
 * Authenticated callers want {@link resolveAccessiblePoolScope}.
 */
export async function resolvePoolScope(eventId: string): Promise<PoolScope> {
  return poolScopeFor(eventId, await loadLink(eventId))
}

/**
 * The scope for an event, narrowed to the events this user may see.
 *
 * A staff user scoped to Youth only gets Youth's volunteers, mirroring
 * `getAccessibleClusterEvents` in `lib/clusters/aggregate.ts`. The breakout
 * OWNER is deliberately not narrowed: the day's tables belong to the cluster, and
 * a user who reached this event at all has already passed the layout's
 * cluster-access check. Narrowing the candidate list — who they may seat — is
 * where the permission actually belongs.
 */
export async function resolveAccessiblePoolScope(
  session: Session | null,
  eventId: string
): Promise<PoolScope> {
  const scope = poolScopeFor(eventId, await loadLink(eventId))
  return narrowToAccessible(scope, session)
}

/** The scope for a cluster's own workspace, keyed by the cluster rather than an event. */
export async function resolveClusterPoolScope(
  session: Session | null,
  clusterId: string
): Promise<PoolScope | null> {
  const link = await loadClusterLink(clusterId)
  if (!link) return null
  // The cluster workspace has no single "this event", so anchor on the first
  // member event in display order. Every field that matters here is derived from
  // the link rather than from the anchor.
  const anchor = link.memberEventIds[0] ?? ""
  const scope: PoolScope = {
    ...poolScopeFor(anchor, link),
    // A cluster's own breakouts page addresses cluster-owned tables whatever the
    // kind — poolScopeFor would hand back an event owner for a Parallel cluster.
    breakoutOwner: { clusterId: link.clusterId },
    volunteerEventIds: link.memberEventIds,
    candidateEventIds: link.memberEventIds,
  }
  return narrowToAccessible(scope, session)
}

function narrowToAccessible(scope: PoolScope, session: Session | null): PoolScope {
  if (scope.volunteerEventIds.length <= 1 && scope.candidateEventIds.length <= 1) {
    return scope
  }
  return {
    ...scope,
    volunteerEventIds: scope.volunteerEventIds.filter((id) => canAccessEvent(session, id)),
    candidateEventIds: scope.candidateEventIds.filter((id) => canAccessEvent(session, id)),
  }
}
