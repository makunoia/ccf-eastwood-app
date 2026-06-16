"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useBatchSelection } from "./batch-selection-provider"
import { type BatchDeleteFn } from "./types"

export function BulkDeleteDialog({
  open,
  onOpenChange,
  ids,
  /** Singular noun, e.g. "guest". Pluralized with a trailing "s". */
  entityLabel,
  onDelete,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  ids: string[]
  entityLabel: string
  onDelete: BatchDeleteFn
}) {
  const selection = useBatchSelection()
  const [deleting, setDeleting] = React.useState(false)

  const count = ids.length
  const noun = count === 1 ? entityLabel : `${entityLabel}s`

  async function handleDelete() {
    setDeleting(true)
    const result = await onDelete(ids)
    setDeleting(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    const { deleted, failed } = result.data
    if (failed.length === 0) {
      toast.success(`Deleted ${deleted} ${deleted === 1 ? entityLabel : `${entityLabel}s`}.`)
      selection?.clear()
    } else {
      const firstReason = failed[0].reason
      toast.warning(
        `Deleted ${deleted} of ${ids.length}. ${failed.length} couldn't be deleted${
          firstReason ? `: ${firstReason}` : ""
        }.`
      )
      // Keep the failed rows selected so the user can see what remains.
      selection?.replaceSelection(failed.map((f) => f.id))
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Delete {count} {noun}
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete {count} {noun}? This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : `Delete ${count}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
