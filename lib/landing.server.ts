import "server-only"

import { db } from "@/lib/db"
import type { FeatureArea } from "@/app/generated/prisma/client"
import type { UserPermissionEntry } from "@/types/next-auth"
import { DEFAULT_LANDING_PATH, resolveLandingPath } from "@/lib/landing"

/**
 * DB-aware variant of resolveLandingPath for contexts that only have a userId
 * (login + OTP server actions), where the session/JWT is not yet established.
 */
export async function resolveLandingPathForUser(userId: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      permissions: { select: { feature: true } },
      eventAccess: { select: { eventId: true } },
    },
  })

  if (!user) return DEFAULT_LANDING_PATH

  const featureSet = new Set<FeatureArea>(user.permissions.map((p) => p.feature))
  const permissions: UserPermissionEntry[] = Array.from(featureSet).map(
    (feature) => ({ feature, actions: [] })
  )

  return resolveLandingPath({
    role: user.role,
    permissions,
    eventAccess: user.eventAccess.map((e) => e.eventId),
  })
}
