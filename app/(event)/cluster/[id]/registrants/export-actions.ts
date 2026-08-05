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
  events: ClusterExportEvent[]
  columns: ClusterExportColumnState[]
}

/**
 * Every registrant of a cluster — one row per person, never duplicated across
 * the day's events, covering only the cluster events the caller may see — with
 * those events as Yes/No columns, together with the rest of the columns worth
 * offering, so the picker can say which fields the forms gather.
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
