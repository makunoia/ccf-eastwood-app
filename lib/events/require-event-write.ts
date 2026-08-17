import "server-only"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canRead, canWrite, canAccessEvent, isSuperAdmin } from "@/lib/permissions"
import { isClusterOwner, type BreakoutOwner } from "@/lib/breakouts/owner"

export type WriteDenial = { error: string }

/** Whether the session may see at least one of a cluster's member events. */
async function clusterIsVisible(
  clusterId: string,
  can: (eventId: string) => boolean
): Promise<boolean> {
  const links = await db.eventClusterEvent.findMany({
    where: { clusterId },
    select: { eventId: true },
  })
  return links.length > 0 && links.some((l) => can(l.eventId))
}

/**
 * Write access to one event's data.
 *
 * Middleware gates `/event/<id>` by feature + event access, but on the *URL's*
 * event id — a server action carries its own argument, so a user scoped to
 * event A could otherwise pass event B's id from A's page.
 *
 * Lifted here from `breakout-actions.ts` (CCF-148): three files kept
 * byte-identical private copies, and a fourth set of volunteer actions had a
 * variant that omitted the `canAccessEvent` line entirely.
 */
export async function requireEventWrite(eventId: string): Promise<WriteDenial | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canWrite(session, "Events")) return { error: "Unauthorized." }
  if (!canAccessEvent(session, eventId)) return { error: "Unauthorized." }
  return null
}

/**
 * Write access to a cluster's own data — its breakout tables, for now.
 *
 * Access is "may see at least one member event", mirroring the cluster
 * workspace layout (`app/(event)/cluster/[id]/layout.tsx`). `some` rather than
 * `every` is deliberate: the day's tables belong to the day rather than to any
 * one ministry, so requiring access to every member event would lock out staff
 * the cluster workspace already admits — and they would see the page but fail
 * every write on it.
 *
 * An empty cluster is Super Admin only, since there is no member event to
 * derive access from.
 */
export async function requireClusterWrite(clusterId: string): Promise<WriteDenial | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canWrite(session, "Events")) return { error: "Unauthorized." }
  if (isSuperAdmin(session)) return null
  const visible = await clusterIsVisible(clusterId, (id) => canAccessEvent(session, id))
  return visible ? null : { error: "Unauthorized." }
}

/** Read access to one event's data — the read counterpart of `requireEventWrite`. */
export async function requireEventRead(eventId: string): Promise<WriteDenial | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canRead(session, "Events")) return { error: "Unauthorized." }
  if (!canAccessEvent(session, eventId)) return { error: "Unauthorized." }
  return null
}

export async function requireClusterRead(clusterId: string): Promise<WriteDenial | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canRead(session, "Events")) return { error: "Unauthorized." }
  if (isSuperAdmin(session)) return null
  const visible = await clusterIsVisible(clusterId, (id) => canAccessEvent(session, id))
  return visible ? null : { error: "Unauthorized." }
}

/** Dispatches on which side of the breakout XOR owns the group. */
export async function requireBreakoutWrite(
  owner: BreakoutOwner
): Promise<WriteDenial | null> {
  return isClusterOwner(owner)
    ? requireClusterWrite(owner.clusterId)
    : requireEventWrite(owner.eventId)
}

export async function requireBreakoutRead(
  owner: BreakoutOwner
): Promise<WriteDenial | null> {
  return isClusterOwner(owner)
    ? requireClusterRead(owner.clusterId)
    : requireEventRead(owner.eventId)
}
