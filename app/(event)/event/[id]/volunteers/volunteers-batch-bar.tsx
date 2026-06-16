"use client"

import * as React from "react"
import { IconChecklist, IconTrash, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { useBatchSelection } from "@/components/batch/batch-selection-provider"
import { BulkDeleteDialog } from "@/components/batch/bulk-delete-dialog"
import { BulkStatusDialog } from "@/components/batch/bulk-status-dialog"
import {
  deleteVolunteersBatch,
  setVolunteersStatusBatch,
} from "./actions"

const STATUS_OPTIONS = [
  { value: "Pending", label: "Pending" },
  { value: "Confirmed", label: "Confirmed" },
  { value: "Rejected", label: "Rejected" },
]

/**
 * Swaps the volunteer page header between the normal toolbar (no selection) and
 * a batch-action bar (≥1 selected). Mirrors `BatchActionHeader` but exposes the
 * volunteer-specific Set-status / Remove actions. Binds `eventId` so the batch
 * server actions stay scoped to this event.
 */
export function VolunteersBatchBar({
  eventId,
  children,
}: {
  eventId: string
  children: React.ReactNode
}) {
  const selection = useBatchSelection()
  const [statusOpen, setStatusOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

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
        <Button variant="outline" onClick={() => setStatusOpen(true)}>
          Set status
        </Button>
        <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
          <IconTrash className="size-4" />
          Remove
        </Button>
      </div>

      <BulkStatusDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        ids={ids}
        statuses={STATUS_OPTIONS}
        onApply={(rowIds, status) =>
          setVolunteersStatusBatch(eventId, rowIds, status)
        }
      />
      <BulkDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        ids={ids}
        entityLabel="volunteer"
        onDelete={(rowIds) => deleteVolunteersBatch(eventId, rowIds)}
      />
    </>
  )
}
