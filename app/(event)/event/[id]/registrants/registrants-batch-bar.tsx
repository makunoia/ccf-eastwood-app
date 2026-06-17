"use client"

import * as React from "react"
import { IconCheck, IconChecklist, IconTrash, IconX } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useBatchSelection } from "@/components/batch/batch-selection-provider"
import { BulkDeleteDialog } from "@/components/batch/bulk-delete-dialog"
import {
  deleteRegistrantsBatch,
  setRegistrantsAttendanceBatch,
} from "./batch-actions"

/**
 * Swaps the registrants page header between the normal toolbar (no selection)
 * and a batch-action bar (≥1 selected). Mirrors `VolunteersBatchBar` but exposes
 * the registrant-specific attendance / remove actions. Binds `eventId` so the
 * batch server actions stay scoped to this event.
 *
 * Attendance buttons only render for OneTime events (`canMarkAttendance`), since
 * MultiDay and Recurring track attendance per occurrence.
 */
export function RegistrantsBatchBar({
  eventId,
  canMarkAttendance,
  children,
}: {
  eventId: string
  canMarkAttendance: boolean
  children: React.ReactNode
}) {
  const selection = useBatchSelection()
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [applying, setApplying] = React.useState(false)

  // Selection disabled (no write permission) — render the normal toolbar only.
  if (!selection?.enabled) return <>{children}</>

  const ids = [...selection.selectedIds]
  const count = ids.length

  if (count === 0) {
    return (
      <>
        {/* Mobile: enter/exit selection mode */}
        <Button
          variant={selection.selectMode ? "secondary" : "outline"}
          size="icon"
          className="md:hidden"
          aria-label={selection.selectMode ? "Done selecting" : "Select"}
          onClick={() => selection.setSelectMode(!selection.selectMode)}
        >
          {selection.selectMode ? (
            <IconX className="size-4" />
          ) : (
            <IconChecklist className="size-4" />
          )}
        </Button>
        {children}
      </>
    )
  }

  async function applyAttendance(attended: boolean) {
    setApplying(true)
    const result = await setRegistrantsAttendanceBatch(eventId, ids, attended)
    setApplying(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(
      `Marked ${result.data.updated} ${
        result.data.updated === 1 ? "registrant" : "registrants"
      } as ${attended ? "attended" : "absent"}.`
    )
    selection?.clear()
    selection?.setSelectMode(false)
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => {
            selection.clear()
            selection.setSelectMode(false)
          }}
          aria-label="Clear selection"
        >
          <IconX className="size-4" />
        </Button>
        <span className="text-sm font-medium whitespace-nowrap">
          {count} selected
        </span>
        {canMarkAttendance && (
          <>
            <Button
              variant="outline"
              disabled={applying}
              onClick={() => applyAttendance(true)}
            >
              <IconCheck className="size-4" />
              Attended
            </Button>
            <Button
              variant="outline"
              disabled={applying}
              onClick={() => applyAttendance(false)}
            >
              <IconX className="size-4" />
              Absent
            </Button>
          </>
        )}
        <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
          <IconTrash className="size-4" />
          Remove
        </Button>
      </div>

      <BulkDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        ids={ids}
        entityLabel="registrant"
        onDelete={(rowIds) => deleteRegistrantsBatch(eventId, rowIds)}
      />
    </>
  )
}
