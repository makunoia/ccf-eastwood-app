"use client"

import * as React from "react"
import { IconDownload } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { exportClusterRegistrationsCSV } from "@/lib/export-entities"
import { getClusterRegistrationsExport } from "./export-actions"

type Props = {
  clusterId: string
  /** Base filename (no extension) for the downloaded CSV. */
  filename: string
  /** At least one event in the cluster charges — adds the payment columns. */
  includePayment: boolean
  disabled?: boolean
}

export function ClusterExportButton({
  clusterId,
  filename,
  includePayment,
  disabled,
}: Props) {
  const [exporting, setExporting] = React.useState(false)

  async function handleExport() {
    setExporting(true)
    const result = await getClusterRegistrationsExport(clusterId)
    setExporting(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }
    if (result.data.length === 0) {
      toast.info("No registrations to export yet.")
      return
    }
    exportClusterRegistrationsCSV(filename, result.data, includePayment)
    toast.success(
      `Exported ${result.data.length} registration${result.data.length === 1 ? "" : "s"}.`,
    )
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={disabled || exporting}>
      <IconDownload className="size-4" />
      {exporting ? "Exporting…" : "Export"}
    </Button>
  )
}
