"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconArrowLeft, IconTrash } from "@tabler/icons-react"
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
import {
  defaultSmallGroupForm,
  type SmallGroupFormValues,
} from "@/lib/validations/small-group"
import { createSmallGroup, updateSmallGroup, deleteSmallGroup } from "./actions"
import { type SmallGroupRow } from "./columns"

type GroupMember = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
}

type Props = {
  members: { id: string; firstName: string; lastName: string }[]
  smallGroups: { id: string; name: string }[]
  lifeStages: { id: string; name: string }[]
  group?: SmallGroupRow
  groupMembers?: GroupMember[]
}

function toFormValues(group: SmallGroupRow): SmallGroupFormValues {
  return {
    name: group.name,
    leaderId: group.leaderId,
    parentGroupId: group.parentGroupId ?? "",
    lifeStageId: group.lifeStageId ?? "",
    genderFocus: group.genderFocus ?? "",
    language: group.language ?? "",
    ageRangeMin: group.ageRangeMin != null ? String(group.ageRangeMin) : "",
    ageRangeMax: group.ageRangeMax != null ? String(group.ageRangeMax) : "",
    meetingFormat: group.meetingFormat ?? "",
    locationCity: group.locationCity ?? "",
    memberLimit: group.memberLimit != null ? String(group.memberLimit) : "",
  }
}

export function SmallGroupForm({ members, smallGroups, lifeStages, group, groupMembers }: Props) {
  const router = useRouter()
  const isEdit = !!group
  const [form, setForm] = React.useState<SmallGroupFormValues>(
    group ? toFormValues(group) : defaultSmallGroupForm
  )
  const [saving, setSaving] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  function set(field: keyof SmallGroupFormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  // For edit mode, exclude self from parent group options to prevent trivial cycles
  const parentGroupOptions = smallGroups.filter((g) => g.id !== group?.id)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const result = isEdit
      ? await updateSmallGroup(group!.id, form)
      : await createSmallGroup(form)

    setSaving(false)

    if (result.success) {
      toast.success(isEdit ? "Small group updated" : "Small group created")
      router.push("/small-groups")
    } else {
      toast.error(result.error)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteSmallGroup(group!.id)
    setDeleting(false)
    if (result.success) {
      toast.success("Small group deleted")
      router.push("/small-groups")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <Link
          href="/small-groups"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Small Groups
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">
            {isEdit ? group!.name : "New Small Group"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? "Edit group details below."
              : "Fill in the details to create a new small group."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isEdit && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              disabled={saving}
            >
              <IconTrash className="size-4" />
              Delete
            </Button>
          )}
          <Button type="submit" form="small-group-form" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create group"}
          </Button>
        </div>
      </div>

      <form
        id="small-group-form"
        onSubmit={handleSubmit}
        className="max-w-2xl space-y-8"
      >
        {/* Basic Info */}
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            Group Information
          </h3>

          <div className="space-y-2">
            <Label htmlFor="name">
              Group Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Victory Group Alpha"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="leaderId">
              Leader <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.leaderId}
              onValueChange={(v) => set("leaderId", v)}
              required
            >
              <SelectTrigger id="leaderId">
                <SelectValue placeholder="Select a leader" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.firstName} {m.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="parentGroupId">Parent Group</Label>
            <Select
              value={form.parentGroupId}
              onValueChange={(v) =>
                set("parentGroupId", v === "none" ? "" : v)
              }
            >
              <SelectTrigger id="parentGroupId">
                <SelectValue placeholder="No parent (top-level group)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {parentGroupOptions.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        {/* Matching Info */}
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            Matching Information
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lifeStageId">Life Stage</Label>
              <Select
                value={form.lifeStageId}
                onValueChange={(v) =>
                  set("lifeStageId", v === "none" ? "" : v)
                }
              >
                <SelectTrigger id="lifeStageId">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any</SelectItem>
                  {lifeStages.map((ls) => (
                    <SelectItem key={ls.id} value={ls.id}>
                      {ls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="genderFocus">Gender Focus</Label>
              <Select
                value={form.genderFocus}
                onValueChange={(v) =>
                  set("genderFocus", v === "none" ? "" : v)
                }
              >
                <SelectTrigger id="genderFocus">
                  <SelectValue placeholder="Mixed" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Mixed</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="language">Primary Language</Label>
            <Input
              id="language"
              value={form.language}
              onChange={(e) => set("language", e.target.value)}
              placeholder="Filipino"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ageRangeMin">Min Age</Label>
              <Input
                id="ageRangeMin"
                type="number"
                min={1}
                value={form.ageRangeMin}
                onChange={(e) => set("ageRangeMin", e.target.value)}
                placeholder="18"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ageRangeMax">Max Age</Label>
              <Input
                id="ageRangeMax"
                type="number"
                min={1}
                value={form.ageRangeMax}
                onChange={(e) => set("ageRangeMax", e.target.value)}
                placeholder="35"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="meetingFormat">Meeting Format</Label>
              <Select
                value={form.meetingFormat}
                onValueChange={(v) =>
                  set("meetingFormat", v === "none" ? "" : v)
                }
              >
                <SelectTrigger id="meetingFormat">
                  <SelectValue placeholder="No preference" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No preference</SelectItem>
                  <SelectItem value="Online">Online</SelectItem>
                  <SelectItem value="Hybrid">Hybrid</SelectItem>
                  <SelectItem value="InPerson">In Person</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="locationCity">City</Label>
              <Input
                id="locationCity"
                value={form.locationCity}
                onChange={(e) => set("locationCity", e.target.value)}
                placeholder="Quezon City"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="memberLimit">Member Limit</Label>
            <Input
              id="memberLimit"
              type="number"
              min={1}
              value={form.memberLimit}
              onChange={(e) => set("memberLimit", e.target.value)}
              placeholder="12"
            />
          </div>
        </section>
      </form>

      {isEdit && groupMembers && (
        <section className="max-w-2xl space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Members ({groupMembers.length})
          </h3>
          {groupMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members in this group yet.</p>
          ) : (
            <div className="rounded-md border divide-y">
              {groupMembers.map((m) => (
                <Link
                  key={m.id}
                  href={`/members/${m.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm font-medium">
                    {m.firstName} {m.lastName}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {m.email ?? m.phone ?? "—"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete small group</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">{group?.name}</span>? This action
              cannot be undone.
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
