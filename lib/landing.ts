/**
 * Computes the post-login landing path for a user based on their access scope.
 *
 * Rule: a Staff user whose ONLY feature permission is Events and who has access
 * to exactly one event is sent straight to that event workspace instead of the
 * top-level dashboard (which would show nav/widgets they cannot use). Everyone
 * else (Super Admins, multi-feature staff, multi-event staff) lands on /dashboard.
 *
 * This module is edge-safe — it imports no Prisma/DB code — so it can be used
 * inside middleware (proxy.ts). For server actions that only have a userId, use
 * `resolveLandingPathForUser` in lib/landing.server.ts.
 */
import type { UserRole } from "@/app/generated/prisma/client"
import type { UserPermissionEntry } from "@/types/next-auth"

export const DEFAULT_LANDING_PATH = "/dashboard"

export type LandingScope = {
  role: UserRole
  permissions: UserPermissionEntry[]
  eventAccess: string[]
}

export function resolveLandingPath({
  role,
  permissions,
  eventAccess,
}: LandingScope): string {
  if (role !== "Staff") return DEFAULT_LANDING_PATH

  const onlyEventsFeature =
    permissions.length === 1 && permissions[0]?.feature === "Events"

  if (onlyEventsFeature && eventAccess.length === 1) {
    return `/event/${eventAccess[0]}`
  }

  return DEFAULT_LANDING_PATH
}
