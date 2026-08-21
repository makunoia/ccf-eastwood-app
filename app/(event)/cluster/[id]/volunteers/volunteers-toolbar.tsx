"use client"

import * as React from "react"
import { IconDownload, IconPlus } from "@tabler/icons-react"
import { PageActions, type PageAction } from "@/components/page-header"
import { useExportColumnsDialog } from "@/components/exports/export-columns-dialog"
import { exportClusterVolunteersCSV } from "@/lib/export-entities"
import { exportFilename } from "@/lib/exports/filename"
import {
  VOLUNTEER_EXPORT_GROUPS,
  type VolunteerExportGroup,
} from "@/lib/exports/event-volunteers"
import type { ClusterVolunteerExportRow } from "@/lib/exports/cluster-volunteers"
import { getClusterVolunteersExport } from "./export-actions"

type Props = {
  clusterId: string
  clusterName: string
  canEdit: boolean
  canExport: boolean
  /** Which list is on screen — the export describes the same one. */
  scope: "day" | "all"
}

/**
 * The day's Volunteers header actions.
 *
 * No Import, deliberately. The volunteer importer takes a single `eventId` for
 * its committee and role lookups, and a Collab day has two — a spreadsheet would
 * have to carry a ministry column the importer has no field for, and guessing
 * would file people onto the wrong ministry's team silently. Importing into
 * either member event's own workspace still works; those rows land on the
 * standing roster rather than the day, which is the honest result for a sheet
 * that never named a day.
 */
export function ClusterVolunteersToolbar({
  clusterId,
  clusterName,
  canEdit,
  canExport,
  scope,
}: Props) {
  const { open: openExport, dialog: exportDialog } = useExportColumnsDialog<
    ClusterVolunteerExportRow,
    VolunteerExportGroup
  >({
    title: "Export volunteers",
    description:
      scope === "day"
        ? "Everyone who signed up to serve on this day, with their ministry, committee and role."
        : "Both ministries' standing rosters, with their committee and role.",
    groups: VOLUNTEER_EXPORT_GROUPS,
    unit: ["volunteer", "volunteers"],
    emptyMessage: "No volunteers to export yet.",
    loadingMessage: "Gathering volunteers…",
    load: () => getClusterVolunteersExport(clusterId, scope),
    download: (rows, selected) =>
      exportClusterVolunteersCSV(
        exportFilename(clusterName, scope === "day" ? "volunteers" : "volunteers-all"),
        rows,
        selected,
      ),
  })

  const actions: PageAction[] = canExport
    ? [
        {
          label: "Export",
          icon: <IconDownload className="size-4" />,
          onSelect: openExport,
          overflow: true,
        },
      ]
    : []

  return (
    <PageActions
      primary={
        canEdit
          ? {
              label: "Add Volunteer",
              icon: <IconPlus className="size-4" />,
              href: `/cluster/${clusterId}/volunteers/new`,
            }
          : undefined
      }
      actions={actions}
    >
      {exportDialog}
    </PageActions>
  )
}
