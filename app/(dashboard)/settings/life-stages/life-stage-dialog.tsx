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
  defaultLifeStageForm,
  type LifeStageFormValues,
} from "@/lib/validations/life-stage"
import { createLifeStage, updateLifeStage } from "./actions"
import { type LifeStageRow } from "./columns"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  lifeStage?: LifeStageRow // if provided = edit mode
}

function toFormValues(lifeStage: LifeStageRow): LifeStageFormValues {
  return {
    name: lifeStage.name,
    order: String(lifeStage.order),
  }
}

export function LifeStageDialog({ open, onOpenChange, lifeStage }: Props) {
  const isEdit = !!lifeStage
  const [form, setForm] = React.useState<LifeStageFormValues>(
    lifeStage ? toFormValues(lifeStage) : defaultLifeStageForm
  )
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(lifeStage ? toFormValues(lifeStage) : defaultLifeStageForm)
  }, [lifeStage])

  function set(field: keyof LifeStageFormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const result = isEdit
      ? await updateLifeStage(lifeStage!.id, form)
      : await createLifeStage(form)

    setSaving(false)

    if (result.success) {
      toast.success(isEdit ? "Life stage updated" : "Life stage added")
      onOpenChange(false)
      if (!isEdit) setForm(defaultLifeStageForm)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit life stage" : "Add life stage"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the life stage details below."
              : "Fill in the details to add a new life stage."}
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
                placeholder="e.g. Youth"
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
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add life stage"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
