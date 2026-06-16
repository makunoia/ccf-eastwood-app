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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useBatchSelection } from "./batch-selection-provider"
import { type BatchStatusFn } from "./types"

/**
 * Generic bulk-status picker. Applies one of `statuses` to every selected row
 * via `onApply`. Modeled on {@link BulkLifeStageDialog} but for a fixed enum of
 * status values rather than a fetched list.
 */
export function BulkStatusDialog({
  open,
  onOpenChange,
  ids,
  statuses,
  onApply,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  ids: string[]
  statuses: { value: string; label: string }[]
  onApply: BatchStatusFn
}) {
  const selection = useBatchSelection()
  const [value, setValue] = React.useState<string>("")
  const [saving, setSaving] = React.useState(false)

  // Reset the picker each time the dialog opens (render-phase adjustment).
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setValue("")
  }

  const count = ids.length

  async function handleApply() {
    if (!value) return
    setSaving(true)
    const result = await onApply(ids, value)
    setSaving(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(
      `Updated status for ${result.data.updated} ${
        result.data.updated === 1 ? "record" : "records"
      }.`
    )
    selection?.clear()
    selection?.setSelectMode(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set status</DialogTitle>
          <DialogDescription>
            Apply a status to {count} selected{" "}
            {count === 1 ? "record" : "records"}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bulk-status">Status</Label>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger id="bulk-status" className="w-full">
              <SelectValue placeholder="Select a status" />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={saving || !value}>
            {saving ? "Saving…" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
