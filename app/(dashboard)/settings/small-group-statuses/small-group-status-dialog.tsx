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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  defaultSmallGroupStatusForm,
  type SmallGroupStatusFormValues,
} from "@/lib/validations/small-group-status"
import { createSmallGroupStatus, updateSmallGroupStatus } from "./actions"
import { type SmallGroupStatusRow } from "./columns"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  status?: SmallGroupStatusRow
}

function toFormValues(status: SmallGroupStatusRow): SmallGroupStatusFormValues {
  return {
    name: status.name,
    order: String(status.order),
  }
}

export function SmallGroupStatusDialog({ open, onOpenChange, status }: Props) {
  const isEdit = !!status
  const [form, setForm] = React.useState<SmallGroupStatusFormValues>(
    status ? toFormValues(status) : defaultSmallGroupStatusForm
  )
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setForm(status ? toFormValues(status) : defaultSmallGroupStatusForm)
  }, [status])

  function set(field: keyof SmallGroupStatusFormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const result = isEdit
      ? await updateSmallGroupStatus(status!.id, form)
      : await createSmallGroupStatus(form)

    setSaving(false)

    if (result.success) {
      toast.success(isEdit ? "Status updated" : "Status added")
      onOpenChange(false)
      if (!isEdit) setForm(defaultSmallGroupStatusForm)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit status" : "Add status"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the status details below."
              : "Fill in the details to add a new small group status."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Regular"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order">
                Order <span className="text-destructive">*</span>
              </Label>
              <Input
                id="order"
                type="number"
                min={0}
                value={form.order}
                onChange={(e) => set("order", e.target.value)}
                placeholder="e.g. 1"
                required
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add status"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
