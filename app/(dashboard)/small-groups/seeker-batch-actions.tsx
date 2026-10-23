"use client"

import * as React from "react"
import { IconChecklist, IconX } from "@tabler/icons-react"
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
import { useBatchSelection } from "@/components/batch/batch-selection-provider"
import { SelectionSummary } from "@/components/batch/selection-summary"
import { dismissSeekerRequestsBatch } from "./actions"

export function SeekerBatchActions() {
  const selection = useBatchSelection()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  if (!selection?.enabled) return null
  const activeSelection = selection

  const ids = [...activeSelection.selectedIds]
  const count = ids.length

  if (count === 0) {
    return (
      <Button
        variant={activeSelection.selectMode ? "secondary" : "outline"}
        size="icon"
        className="md:hidden"
        aria-label={activeSelection.selectMode ? "Done selecting" : "Select seekers"}
        onClick={() => activeSelection.setSelectMode(!activeSelection.selectMode)}
      >
        {activeSelection.selectMode ? <IconX className="size-4" /> : <IconChecklist className="size-4" />}
      </Button>
    )
  }

  async function handleDismiss() {
    setPending(true)
    const result = await dismissSeekerRequestsBatch(ids)
    setPending(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    const { dismissed, failed } = result.data
    if (failed.length === 0) {
      toast.success(`Dismissed ${dismissed} ${dismissed === 1 ? "request" : "requests"}.`)
      activeSelection.clear()
      activeSelection.setSelectMode(false)
    } else {
      toast.warning(
        `Dismissed ${dismissed} of ${count}. ${failed.length} skipped: ${failed[0].name} ${failed[0].reason}${
          failed.length > 1 ? `, and ${failed.length - 1} more` : ""
        }.`
      )
      activeSelection.replaceSelection(failed.map((failure) => failure.id))
    }
    setOpen(false)
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <SelectionSummary
          count={count}
          onClear={() => {
            activeSelection.clear()
            activeSelection.setSelectMode(false)
          }}
        />
        <Button variant="outline" onClick={() => setOpen(true)}>
          <IconX className="size-4" />
          Dismiss
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss {count} {count === 1 ? "request" : "requests"}?</DialogTitle>
            <DialogDescription>
              {count === 1 ? "This person" : "These people"} will leave the seekers queue. Their matching profiles and request history are kept, and they can ask to join a DGroup again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={handleDismiss} disabled={pending}>
              {pending ? "Dismissing…" : `Dismiss ${count}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
