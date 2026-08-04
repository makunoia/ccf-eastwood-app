"use server"

import { auth } from "@/lib/auth"
import { canExport } from "@/lib/permissions"
import { getClusterRegistrationExportRows } from "@/lib/clusters/aggregate"
import type { ClusterRegistrationExportRow } from "@/lib/export-entities"

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * Every registration record for a cluster — one row per registrant per event,
 * covering only the cluster events the caller may see.
 */
export async function getClusterRegistrationsExport(
  clusterId: string,
): Promise<ActionResult<ClusterRegistrationExportRow[]>> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Not authenticated." }
  if (!canExport(session, "Events")) return { success: false, error: "Unauthorized." }

  try {
    const rows = await getClusterRegistrationExportRows(session, clusterId)
    return { success: true, data: rows }
  } catch {
    return { success: false, error: "Failed to export registrations." }
  }
}
