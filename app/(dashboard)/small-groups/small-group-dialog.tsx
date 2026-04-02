"use client"

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  defaultSmallGroupForm,
  type SmallGroupFormValues,
} from "@/lib/validations/small-group"
import { createSmallGroup, updateSmallGroup } from "./actions"
import { type SmallGroupRow } from "./columns"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: { id: string; firstName: string; lastName: string }[]
  smallGroups: { id: string; name: string }[]
  lifeStages: { id: string; name: string }[]
  group?: SmallGroupRow // if provided = edit mode
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

export function SmallGroupDialog({
  open,
  onOpenChange,
  members,
  smallGroups,
  lifeStages,
  group,
}: Props) {
  const isEdit = !!group
  const [form, setForm] = React.useState<SmallGroupFormValues>(
    group ? toFormValues(group) : defaultSmallGroupForm
  )
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setForm(group ? toFormValues(group) : defaultSmallGroupForm)
  }, [group])

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
      onOpenChange(false)
      if (!isEdit) setForm(defaultSmallGroupForm)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-xl overflow-y-auto">
        <SheetHeader className="px-6 pt-6">
          <SheetTitle>{isEdit ? "Edit small group" : "Add small group"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update the group's information below."
              : "Fill in the details to create a new small group."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
          <div className="flex-1 space-y-6 px-6 py-4">
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
          </div>

          <SheetFooter className="border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Create group"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
