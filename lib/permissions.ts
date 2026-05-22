import type { Session } from "next-auth"
import type { FeatureArea, PermissionAction } from "@/app/generated/prisma/client"

export type { FeatureArea, PermissionAction }

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

function hasAction(
  session: Session | null,
  feature: FeatureArea,
  action: PermissionAction
): boolean {
  if (!session?.user) return false
  if (isSuperAdmin(session)) return true
  const entry = (session.user.permissions ?? []).find((p) => p.feature === feature)
  return entry?.actions.includes(action) ?? false
}

/**
 * Returns true if the user can read (view) the given feature area.
 * Write, Import, and Export all imply Read, so any granted action satisfies this.
 */
export function canRead(session: Session | null, feature: FeatureArea): boolean {
  if (!session?.user) return false
  if (isSuperAdmin(session)) return true
  const entry = (session.user.permissions ?? []).find((p) => p.feature === feature)
  return (entry?.actions.length ?? 0) > 0
}

/** Returns true if the user can create, update, or delete records in the given feature area. */
export function canWrite(session: Session | null, feature: FeatureArea): boolean {
  return hasAction(session, feature, "Write")
}

/** Returns true if the user can import data in the given feature area. */
export function canImport(session: Session | null, feature: FeatureArea): boolean {
  return hasAction(session, feature, "Import")
}

/** Returns true if the user can export data in the given feature area. */
export function canExport(session: Session | null, feature: FeatureArea): boolean {
  return hasAction(session, feature, "Export")
}

/** Alias for canRead — kept for backward compatibility with route-level access checks. */
export function hasFeatureAccess(
  session: Session | null,
  feature: FeatureArea
): boolean {
  return canRead(session, feature)
}

/**
 * Returns true if the user can access the given event.
 * - Super Admin: always true
 * - Staff with Events read access + empty eventAccess list: all events
 * - Staff with Events read access + populated eventAccess list: only listed event IDs
 */
export function canAccessEvent(
  session: Session | null,
  eventId: string
): boolean {
  if (!session?.user) return false
  if (isSuperAdmin(session)) return true
  if (!canRead(session, "Events")) return false
  const allowed = session.user.eventAccess ?? []
  if (allowed.length === 0) return true
  return allowed.includes(eventId)
}
