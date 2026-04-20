"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  defaultMinistryForm,
  type MinistryFormValues,
} from "@/lib/validations/ministry"
import { createMinistry, updateMinistry, deleteMinistry } from "./actions"
import { type MinistryRow } from "./columns"
import { MobileFormActions } from "@/components/mobile-form-actions"
type Props = {
  lifeStages: { id: string; name: string }[]
  ministry?: MinistryRow
}

function toFormValues(ministry: MinistryRow): MinistryFormValues {
  return {
    name: ministry.name,
    lifeStageId: ministry.lifeStageId ?? "",
    description: ministry.description ?? "",
  }
}

export function MinistryForm({ lifeStages, ministry }: Props) {
  const router = useRouter()
  const isEdit = !!ministry
  const [form, setForm] = React.useState<MinistryFormValues>(
    () => ministry ? toFormValues(ministry) : defaultMinistryForm
  )
  const [saving, setSaving] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  function set(field: keyof MinistryFormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleRevert() {
    setForm(ministry ? toFormValues(ministry) : defaultMinistryForm)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const result = isEdit
      ? await updateMinistry(ministry!.id, form)
      : await createMinistry(form)

    setSaving(false)

    if (result.success) {
      toast.success(isEdit ? "Ministry updated" : "Ministry added")
      router.push("/ministries")
    } else {
      toast.error(result.error)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteMinistry(ministry!.id)
    setDeleting(false)
    if (result.success) {
      toast.success("Ministry deleted")
      router.push("/ministries")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pb-24 sm:pb-6">
      <div>
        <Link
          href="/ministries"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Ministries
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">
            {isEdit ? ministry!.name : "New Ministry"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? "Edit ministry details below."
              : "Fill in the details to add a new ministry."}
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {isEdit && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              disabled={saving}
            >
              Delete
            </Button>
          )}
          <Button type="submit" form="ministry-form" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add ministry"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <form
            id="ministry-form"
            onSubmit={handleSubmit}
            className="max-w-2xl space-y-6"
          >
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Across, Elevate"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lifeStage">Life Stage</Label>
              <Select
                value={form.lifeStageId}
                onValueChange={(v) => set("lifeStageId", v === "none" ? "" : v)}
              >
                <SelectTrigger id="lifeStage">
                  <SelectValue placeholder="Select life stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {lifeStages.map((ls) => (
                    <SelectItem key={ls.id} value={ls.id}>
                      {ls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Brief description of this ministry…"
                rows={3}
              />
            </div>
          </form>
        </TabsContent>
      </Tabs>

      <MobileFormActions
        formId="ministry-form"
        isEdit={isEdit}
        saving={saving}
        saveLabel={isEdit ? "Save changes" : "Add ministry"}
        onRevert={handleRevert}
        onDelete={isEdit ? () => setDeleteOpen(true) : undefined}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete ministry</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">{ministry?.name}</span>? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
