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
import { type BatchLifeStageFn } from "./types"

const NONE_VALUE = "__none__"

export function BulkLifeStageDialog({
  open,
  onOpenChange,
  ids,
  lifeStages,
  onApply,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  ids: string[]
  lifeStages: { id: string; name: string }[]
  onApply: BatchLifeStageFn
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
    const result = await onApply(ids, value === NONE_VALUE ? null : value)
    setSaving(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(
      `Updated life stage for ${result.data.updated} ${
        result.data.updated === 1 ? "record" : "records"
      }.`
    )
    selection?.clear()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set life stage</DialogTitle>
          <DialogDescription>
            Apply a life stage to {count} selected{" "}
            {count === 1 ? "record" : "records"}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bulk-life-stage">Life stage</Label>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger id="bulk-life-stage" className="w-full">
              <SelectValue placeholder="Select a life stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>— None —</SelectItem>
              {lifeStages.map((ls) => (
                <SelectItem key={ls.id} value={ls.id}>
                  {ls.name}
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
