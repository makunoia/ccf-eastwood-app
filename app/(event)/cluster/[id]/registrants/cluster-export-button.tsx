"use client"

import * as React from "react"
import { IconDownload } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { useExportColumnsDialog } from "@/components/exports/export-columns-dialog"
import { exportClusterRegistrationsCSV } from "@/lib/export-entities"
import {
  CLUSTER_EXPORT_GROUPS,
  type ClusterExportEvent,
  type ClusterRegistrationExportRow,
} from "@/lib/exports/cluster-registrations"
import { getClusterRegistrationsExport } from "./export-actions"

type Props = {
  clusterId: string
  /** Base filename (no extension) for the downloaded CSV. */
  filename: string
  disabled?: boolean
}

export function ClusterExportButton({ clusterId, filename, disabled }: Props) {
  // The events come back with the rows and are needed to rebuild the same
  // registry the column offer was computed from.
  const events = React.useRef<ClusterExportEvent[]>([])

  const { open, dialog } = useExportColumnsDialog<
    ClusterRegistrationExportRow,
    (typeof CLUSTER_EXPORT_GROUPS)[number]
  >({
    title: "Export registrations",
    description: (
      <>
        Everything the day&apos;s registration forms collected. One row per person —
        someone on three of the day&apos;s events is a single row, with a column per
        event showing whether they checked in.
      </>
    ),
    groups: CLUSTER_EXPORT_GROUPS,
    unit: ["person", "people"],
    emptyMessage: "No registrations to export yet.",
    loadingMessage: "Gathering registrations…",
    load: async () => {
      const result = await getClusterRegistrationsExport(clusterId)
      if (result.success) events.current = result.data.events
      return result
    },
    download: (rows, selected) =>
      exportClusterRegistrationsCSV(filename, rows, selected, events.current),
  })

  return (
    <>
      <Button variant="outline" onClick={open} disabled={disabled}>
        <IconDownload className="size-4" />
        Export
      </Button>
      {dialog}
    </>
  )
}
