import type { Prisma } from "@/app/generated/prisma/client"

/**
 * Who owns a breakout group (CCF-148).
 *
 * A breakout group belongs to exactly one of two things:
 *
 *  - an **event**, for a standing table that persists across that event's
 *    occurrences — every group that existed before Collab clusters;
 *  - a **cluster**, for a table set up for one Collab day. A collab's tables
 *    belong to the day rather than to either ministry's event, which is what
 *    lets the day's seating be arranged from scratch without rewriting either
 *    ministry's standing rosters.
 *
 * Spelled as a Prisma where-fragment because that is how it is used: nearly
 * every breakout query scoped on a bare `eventId`, and each of those becomes
 * `...owner` instead. The two shapes are structurally exclusive, so a caller
 * cannot accidentally pass both.
 *
 * Pure and free of `server-only` on purpose — the scope resolver
 * (`lib/events/pool-scope.ts`) is DB-aware and imports from here, and the client
 * components that pass an owner down to a server action need the type.
 */
export type BreakoutOwner = { eventId: string } | { clusterId: string }

export function eventOwner(eventId: string): BreakoutOwner {
  return { eventId }
}

export function clusterOwner(clusterId: string): BreakoutOwner {
  return { clusterId }
}

/**
 * What a breakout UI needs to know about where it is standing: who owns the
 * tables it is editing, and which workspace to build links against.
 *
 * The two used to be one thing — an `eventId` prop that scoped the server
 * actions *and* built `/event/<id>/…` hrefs. They separate under CCF-148: the
 * same table components render inside the event workspace and inside a cluster's,
 * so the route base is no longer derivable from the owner's id alone.
 */
export type BreakoutSurface = {
  owner: BreakoutOwner
  /** Workspace route base — `/event/<id>` or `/cluster/<id>`. No trailing slash. */
  basePath: string
}

export function eventSurface(eventId: string): BreakoutSurface {
  return { owner: { eventId }, basePath: `/event/${eventId}` }
}

export function clusterSurface(clusterId: string): BreakoutSurface {
  return { owner: { clusterId }, basePath: `/cluster/${clusterId}` }
}

/**
 * The surface for an owner already in hand — what a caller that resolved a
 * `PoolScope` wants, rather than re-deciding which of the two constructors to
 * call and getting the route base wrong for a cluster-owned table.
 */
export function surfaceFor(owner: BreakoutOwner): BreakoutSurface {
  return isClusterOwner(owner)
    ? clusterSurface(owner.clusterId)
    : eventSurface(owner.eventId)
}

export function isClusterOwner(
  owner: BreakoutOwner
): owner is { clusterId: string } {
  return "clusterId" in owner
}

/** The owning event id, or null when a cluster owns the group. */
export function ownerEventId(owner: BreakoutOwner): string | null {
  return isClusterOwner(owner) ? null : owner.eventId
}

/** The owning cluster id, or null when an event owns the group. */
export function ownerClusterId(owner: BreakoutOwner): string | null {
  return isClusterOwner(owner) ? owner.clusterId : null
}

/**
 * The XOR the schema keeps nullable on both sides — mirrors
 * `isValidFormConfigOwner` in `lib/validations/event-cluster.ts`, which does
 * exactly this for `EventFormConfig`. Both set, or neither, is a programming
 * error rather than user input.
 */
export function isValidBreakoutOwner(
  eventId: string | null | undefined,
  clusterId: string | null | undefined
): boolean {
  return Boolean(eventId) !== Boolean(clusterId)
}

/** Turn a persisted row's two nullable columns back into an owner. */
export function ownerOf(row: {
  eventId: string | null
  clusterId: string | null
}): BreakoutOwner | null {
  if (!isValidBreakoutOwner(row.eventId, row.clusterId)) return null
  return row.clusterId ? { clusterId: row.clusterId } : { eventId: row.eventId! }
}

/**
 * Select fragment for both owner names, so the call sites that only want a
 * display label don't each invent their own include.
 */
export const BREAKOUT_OWNER_NAME_SELECT = {
  event: { select: { name: true } },
  cluster: { select: { name: true } },
} as const satisfies Prisma.BreakoutGroupSelect

/**
 * The occasion a breakout group belongs to, for display: the event's name, or
 * the name of the collab day that owns it.
 *
 * Shared rather than inlined because four unrelated surfaces read this label —
 * the guest detail page, the leader confirmation flow, the DGroup request
 * description and the small-groups import — and a group with no event used to be
 * impossible, so each of them dereferenced `event.name` directly.
 */
export function breakoutOccasionName(group: {
  event?: { name: string } | null
  cluster?: { name: string } | null
}): string | null {
  return group.event?.name ?? group.cluster?.name ?? null
}
