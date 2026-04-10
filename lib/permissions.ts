import type { Session } from "next-auth"
import type { FeatureArea } from "@/app/generated/prisma/client"

export type { FeatureArea }

/** Maps URL path prefixes to the FeatureArea required to access them. */
export const ROUTE_PERMISSIONS: Record<string, FeatureArea> = {
  "/members": "Members",
  "/guests": "Guests",
  "/small-groups": "SmallGroups",
  "/ministries": "Ministries",
  "/events": "Events",
  "/event": "Events",
  "/volunteers": "Volunteers",
}

export function isSuperAdmin(session: Session | null): boolean {
  return session?.user?.role === "SuperAdmin"
}

/**
 * Returns true if the user has access to the given feature area.
 * Super Admins always have full access.
 */
export function hasFeatureAccess(
  session: Session | null,
  feature: FeatureArea
): boolean {
  if (!session?.user) return false
  if (isSuperAdmin(session)) return true
  return (session.user.permissions ?? []).includes(feature)
}

/**
 * Returns true if the user can access the given event.
 * - Super Admin: always true
 * - Staff with Events access + empty eventAccess list: all events
 * - Staff with Events access + populated eventAccess list: only listed event IDs
 */
export function canAccessEvent(
  session: Session | null,
  eventId: string
): boolean {
  if (!session?.user) return false
  if (isSuperAdmin(session)) return true
  if (!hasFeatureAccess(session, "Events")) return false
  const allowed = session.user.eventAccess ?? []
  if (allowed.length === 0) return true
  return allowed.includes(eventId)
}
