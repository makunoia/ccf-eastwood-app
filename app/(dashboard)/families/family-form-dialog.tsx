"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
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
import { Textarea } from "@/components/ui/textarea"
import { createFamily, updateFamily } from "./actions"

type FamilyFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set the dialog edits this family; otherwise it creates a new one. */
  family?: { id: string; name: string; notes: string | null }
  /** Navigate to the new family's detail page after creating. */
  goToDetailOnCreate?: boolean
}

export function FamilyFormDialog({
  open,
  onOpenChange,
  family,
  goToDetailOnCreate = true,
}: FamilyFormDialogProps) {
  const router = useRouter()
  const isEdit = !!family
  const [name, setName] = React.useState(family?.name ?? "")
  const [notes, setNotes] = React.useState(family?.notes ?? "")
  const [saving, setSaving] = React.useState(false)

  // Re-seed the form from props on each open (render-phase reset, not an effect)
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setName(family?.name ?? "")
      setNotes(family?.notes ?? "")
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const result = isEdit
      ? await updateFamily(family.id, { name, notes })
      : await createFamily({ name, notes })
    setSaving(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(isEdit ? "Family updated" : "Family created")
    onOpenChange(false)
    if (!isEdit && goToDetailOnCreate && "data" in result) {
      router.push(`/families/${(result.data as { id: string }).id}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit family" : "New family"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the family's name or notes."
              : "Create a household. You can add parents and children after."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="family-name">Family name</Label>
            <Input
              id="family-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dela Cruz Family"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="family-notes">Notes</Label>
            <Textarea
              id="family-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create family"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
