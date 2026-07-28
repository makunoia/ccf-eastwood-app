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
  defaultAgeRangeBucketForm,
  type AgeRangeBucketFormValues,
} from "@/lib/validations/age-range-bucket"
import { createAgeRangeBucket, updateAgeRangeBucket } from "./actions"
import { type AgeRangeRow } from "./columns"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  bucket?: AgeRangeRow // if provided = edit mode
}

function toFormValues(bucket: AgeRangeRow): AgeRangeBucketFormValues {
  return {
    label: bucket.label,
    minAge: bucket.minAge === null ? "" : String(bucket.minAge),
    maxAge: bucket.maxAge === null ? "" : String(bucket.maxAge),
    order: String(bucket.order),
  }
}

export function AgeRangeDialog({ open, onOpenChange, bucket }: Props) {
  const isEdit = !!bucket
  const [form, setForm] = React.useState<AgeRangeBucketFormValues>(
    bucket ? toFormValues(bucket) : defaultAgeRangeBucketForm
  )
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(bucket ? toFormValues(bucket) : defaultAgeRangeBucketForm)
  }, [bucket])

  function set(field: keyof AgeRangeBucketFormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const result = isEdit
      ? await updateAgeRangeBucket(bucket!.id, form)
      : await createAgeRangeBucket(form)

    setSaving(false)

    if (result.success) {
      toast.success(isEdit ? "Age range updated" : "Age range added")
      onOpenChange(false)
      if (!isEdit) setForm(defaultAgeRangeBucketForm)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit age range" : "Add age range"}</DialogTitle>
          <DialogDescription>
            Leave a bound empty to make the range open-ended — no minimum reads as
            &ldquo;and under&rdquo;, no maximum as &ldquo;and over&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="label">
                Label <span className="text-destructive">*</span>
              </Label>
              <Input
                id="label"
                value={form.label}
                onChange={(e) => set("label", e.target.value)}
                placeholder="e.g. 30 – 39"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="minAge">Minimum age</Label>
                <Input
                  id="minAge"
                  type="number"
                  min={0}
                  max={150}
                  value={form.minAge}
                  onChange={(e) => set("minAge", e.target.value)}
                  placeholder="30"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxAge">Maximum age</Label>
                <Input
                  id="maxAge"
                  type="number"
                  min={0}
                  max={150}
                  value={form.maxAge}
                  onChange={(e) => set("maxAge", e.target.value)}
                  placeholder="39"
                />
              </div>
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
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add age range"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
