"use server"

import { auth } from "@/lib/auth"
import { canExport } from "@/lib/permissions"
import { getClusterRegistrationExport } from "@/lib/clusters/aggregate"
import type {
  ClusterExportColumnState,
  ClusterExportEvent,
  ClusterRegistrationExportRow,
} from "@/lib/exports/cluster-registrations"

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export type ClusterRegistrationExportPayload = {
  rows: ClusterRegistrationExportRow[]
  columns: ClusterExportColumnState[]
  events: ClusterExportEvent[]
}

/**
 * Everyone on a cluster's day — one row per person, with a column per cluster
 * event they're on, covering only the events the caller may see — together with
 * the columns worth offering, so the picker can say which fields the forms
 * gather.
 */
export async function getClusterRegistrationsExport(
  clusterId: string,
): Promise<ActionResult<ClusterRegistrationExportPayload>> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Not authenticated." }
  if (!canExport(session, "Events")) return { success: false, error: "Unauthorized." }

  try {
    const data = await getClusterRegistrationExport(session, clusterId)
    return { success: true, data }
  } catch {
    return { success: false, error: "Failed to export registrations." }
  }
}
