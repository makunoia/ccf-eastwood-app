"use client"

import * as React from "react"
import { IconDownload } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { exportSessionAttendanceCSV } from "@/lib/export-entities"
import { getSessionsAttendanceExport } from "../export-actions"

type Props = {
  eventId: string
  occurrenceId: string
  /** ISO yyyy-mm-dd — used in the downloaded filename. */
  sessionDate: string
  includeSeries: boolean
  disabled?: boolean
}

export function SessionExportButton({
  eventId,
  occurrenceId,
  sessionDate,
  includeSeries,
  disabled,
}: Props) {
  const [exporting, setExporting] = React.useState(false)

  async function handleExport() {
    setExporting(true)
    const result = await getSessionsAttendanceExport(eventId, occurrenceId)
    setExporting(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }
    if (result.data.length === 0) {
      toast.info("No attendance to export yet.")
      return
    }
    exportSessionAttendanceCSV(`session-attendance-${sessionDate}`, result.data, includeSeries)
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={disabled || exporting}>
      <IconDownload className="size-4" />
      {exporting ? "Exporting…" : "Export"}
    </Button>
  )
}
