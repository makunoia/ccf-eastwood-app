"use client"

import * as React from "react"
import { IconDownload } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { useExportColumnsDialog } from "@/components/exports/export-columns-dialog"
import { exportSessionAttendanceCSV } from "@/lib/export-entities"
import {
  SESSION_ATTENDANCE_GROUPS,
  type SessionAttendanceExportRow,
  type SessionAttendanceGroup,
} from "@/lib/exports/session-attendance"
import { getSessionsAttendanceExport } from "../export-actions"

type Props = {
  eventId: string
  occurrenceId: string
  /** ISO yyyy-mm-dd — used in the downloaded filename. */
  sessionDate: string
  disabled?: boolean
}

export function SessionExportButton({
  eventId,
  occurrenceId,
  sessionDate,
  disabled,
}: Props) {
  const { open, dialog } = useExportColumnsDialog<
    SessionAttendanceExportRow,
    SessionAttendanceGroup
  >({
    title: "Export attendance",
    description:
      "Expected participants and everyone checked in to this session, with RSVP and attendance recorded separately.",
    groups: SESSION_ATTENDANCE_GROUPS,
    unit: ["person", "people"],
    emptyMessage: "No RSVP or attendance to export yet.",
    loadingMessage: "Gathering check-ins…",
    load: () => getSessionsAttendanceExport(eventId, occurrenceId),
    download: (rows, selected) =>
      exportSessionAttendanceCSV(`session-attendance-${sessionDate}`, rows, selected),
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
