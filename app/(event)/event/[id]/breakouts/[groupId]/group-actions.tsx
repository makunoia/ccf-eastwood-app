"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconPencil, IconTrash } from "@tabler/icons-react"
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
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MultiSelect } from "@/components/ui/multi-select"
import { PersonCombobox } from "@/components/ui/person-combobox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TimeInput } from "@/components/ui/time-input"
import { LANGUAGE_OPTIONS } from "@/lib/constants/group-options"
import { updateBreakoutGroup, deleteBreakoutGroup } from "@/app/(dashboard)/events/breakout-actions"

type LedGroup = {
  id: string
  name: string
  lifeStageId: string | null
  genderFocus: string | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: string | null
  locationCity: string | null
  scheduleDayOfWeek: number | null
  scheduleTimeStart: string | null
}

type Volunteer = {
  id: string
  member: { id: string; firstName: string; lastName: string; ledGroups: LedGroup[] }
}

export type EditableGroupData = {
  id: string
  name: string
  facilitatorId: string | null
  memberLimit: number | null
  linkedSmallGroupId: string | null
  lifeStageId: string | null
  genderFocus: string | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: string | null
  locationCity: string | null
  schedule: { dayOfWeek: number; timeStart: string } | null
}

const GENDER_FOCUS_LABELS: Record<string, string> = { Male: "Male", Female: "Female", Mixed: "Mixed" }

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

function deriveProfileFromGroup(g: LedGroup) {
  return {
    lifeStageId: g.lifeStageId ?? "",
    genderFocus: g.genderFocus ?? "",
    language: g.language,
    ageRangeMin: g.ageRangeMin != null ? String(g.ageRangeMin) : "",
    ageRangeMax: g.ageRangeMax != null ? String(g.ageRangeMax) : "",
    meetingFormat: g.meetingFormat ?? "",
    scheduleDayOfWeek: g.scheduleDayOfWeek != null ? String(g.scheduleDayOfWeek) : "",
    scheduleTimeStart: g.scheduleTimeStart ?? "",
  }
}

function EditDialog({
  open,
  onOpenChange,
  group,
  eventId,
  lifeStages,
  volunteers,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  group: EditableGroupData
  eventId: string
  lifeStages: { id: string; name: string }[]
  volunteers: Volunteer[]
}) {
  const [form, setForm] = React.useState({
    name: "",
    memberLimit: "",
    facilitatorId: "",
    lifeStageId: "",
    genderFocus: "",
    language: [] as string[],
    ageRangeMin: "",
    ageRangeMax: "",
    meetingFormat: "",
    scheduleDayOfWeek: "",
    scheduleTimeStart: "",
  })
  const [sourceGroupId, setSourceGroupId] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSourceGroupId(group.linkedSmallGroupId ?? "")
      setForm({
        name: group.name,
        memberLimit: group.memberLimit?.toString() ?? "",
        facilitatorId: group.facilitatorId ?? "",
        lifeStageId: group.lifeStageId ?? "",
        genderFocus: group.genderFocus ?? "",
        language: group.language ?? [],
        ageRangeMin: group.ageRangeMin?.toString() ?? "",
        ageRangeMax: group.ageRangeMax?.toString() ?? "",
        meetingFormat: group.meetingFormat ?? "",
        scheduleDayOfWeek: group.schedule ? String(group.schedule.dayOfWeek) : "",
        scheduleTimeStart: group.schedule?.timeStart ?? "",
      })
    }
  }, [open, group])

  function handleVolunteerChange(volunteerId: string) {
    setSourceGroupId("")
    const vol = volunteers.find((v) => v.id === volunteerId)
    if (!vol) { setForm((f) => ({ ...f, facilitatorId: volunteerId })); return }
    const ledGroups = vol.member.ledGroups
    if (ledGroups.length === 1) {
      setSourceGroupId(ledGroups[0].id)
      setForm((f) => ({ ...f, facilitatorId: volunteerId, ...deriveProfileFromGroup(ledGroups[0]) }))
    } else {
      setForm((f) => ({ ...f, facilitatorId: volunteerId }))
    }
  }

  function handleSourceGroupChange(groupId: string) {
    setSourceGroupId(groupId)
    const vol = volunteers.find((v) => v.id === form.facilitatorId)
    const g = vol?.member.ledGroups.find((lg) => lg.id === groupId)
    if (g) setForm((f) => ({ ...f, ...deriveProfileFromGroup(g) }))
  }

  const selectedVol = volunteers.find((v) => v.id === form.facilitatorId) ?? null
  const ledGroups = selectedVol?.member.ledGroups ?? []
  const isFacilitatorTimothy = !!form.facilitatorId && ledGroups.length === 0

  function field(key: string) {
    return {
      value: form[key as keyof typeof form] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Group name is required"); return }
    if (isFacilitatorTimothy) {
      const missing: string[] = []
      if (!form.genderFocus) missing.push("Gender Focus")
      if (form.language.length === 0) missing.push("Language")
      if (!form.meetingFormat) missing.push("Meeting Format")
      if (!form.scheduleDayOfWeek || !form.scheduleTimeStart) missing.push("Meeting Schedule")
      if (missing.length > 0) {
        toast.error(`Timothy profile requires: ${missing.join(", ")}`)
        return
      }
    }
    setSaving(true)
    const schedule =
      form.scheduleDayOfWeek !== "" && form.scheduleTimeStart !== ""
        ? { dayOfWeek: Number(form.scheduleDayOfWeek), timeStart: form.scheduleTimeStart }
        : null
    const result = await updateBreakoutGroup(group.id, eventId, {
      name: form.name.trim(),
      facilitatorId: form.facilitatorId || null,
      memberLimit: form.memberLimit ? Number(form.memberLimit) : null,
      linkedSmallGroupId: sourceGroupId || null,
      lifeStageId: form.lifeStageId || null,
      genderFocus: (form.genderFocus as "Male" | "Female" | "Mixed") || null,
      language: form.language,
      ageRangeMin: form.ageRangeMin ? Number(form.ageRangeMin) : null,
      ageRangeMax: form.ageRangeMax ? Number(form.ageRangeMax) : null,
      meetingFormat: (form.meetingFormat as "Online" | "Hybrid" | "InPerson") || null,
      locationCity: null,
      schedule,
    })
    setSaving(false)
    if (result.success) {
      toast.success("Breakout group updated")
      onOpenChange(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="sm:max-w-md flex flex-col">
        <DrawerHeader>
          <DrawerTitle>Edit breakout group</DrawerTitle>
          <DrawerDescription>Update the group&apos;s details and matching profile.</DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-6">
          {/* ── Basic details ── */}
          <div className="space-y-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Group Details
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="edit-bg-name">Name <span className="text-destructive">*</span></Label>
              <Input id="edit-bg-name" placeholder="e.g. Breakout A" autoFocus {...field("name")} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-bg-limit">Member Limit</Label>
              <Input id="edit-bg-limit" type="number" min={1} placeholder="Leave blank for unlimited" {...field("memberLimit")} />
            </div>

            <div className="space-y-1.5">
              <Label>Facilitator</Label>
              <PersonCombobox
                options={volunteers.map((v) => ({ value: v.id, label: `${v.member.firstName} ${v.member.lastName}` }))}
                value={form.facilitatorId}
                onValueChange={handleVolunteerChange}
                placeholder="Unassigned"
                clearable
                clearLabel="Unassigned"
              />
            </div>

            {form.facilitatorId && ledGroups.length > 1 && (
              <div className="space-y-1.5">
                <Label>Source small group</Label>
                <Select value={sourceGroupId} onValueChange={handleSourceGroupChange}>
                  <SelectTrigger><SelectValue placeholder="Select a group…" /></SelectTrigger>
                  <SelectContent>
                    {ledGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isFacilitatorTimothy && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                This volunteer does not lead a small group yet (Timothy). Set the profile below — it will be used to create their small group when their first member is confirmed.
              </p>
            )}
          </div>

          {/* ── Matching profile ── */}
          <div className="space-y-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {isFacilitatorTimothy
                ? <>Future Small Group Profile <span className="normal-case font-normal text-destructive">(Timothy — required)</span></>
                : <>Matching Profile <span className="normal-case font-normal">(used for auto-assign)</span></>
              }
            </p>

            <div className="space-y-1.5">
              <Label>Life Stage</Label>
              <Select value={form.lifeStageId} onValueChange={(v) => setForm((f) => ({ ...f, lifeStageId: v === "_none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Any</SelectItem>
                  {lifeStages.map((ls) => <SelectItem key={ls.id} value={ls.id}>{ls.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Gender Focus {isFacilitatorTimothy && <span className="text-destructive">*</span>}</Label>
              <Select value={form.genderFocus} onValueChange={(v) => setForm((f) => ({ ...f, genderFocus: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(GENDER_FOCUS_LABELS).map(([v, label]) => (
                    <SelectItem key={v} value={v}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Language {isFacilitatorTimothy && <span className="text-destructive">*</span>}</Label>
              <MultiSelect options={LANGUAGE_OPTIONS} value={form.language} onChange={(v) => setForm((f) => ({ ...f, language: v }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Min Age</Label>
                <Input type="number" min={0} placeholder="—" {...field("ageRangeMin")} />
              </div>
              <div className="space-y-1.5">
                <Label>Max Age</Label>
                <Input type="number" min={0} placeholder="—" {...field("ageRangeMax")} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Meeting Format {isFacilitatorTimothy && <span className="text-destructive">*</span>}</Label>
              <Select value={form.meetingFormat} onValueChange={(v) => setForm((f) => ({ ...f, meetingFormat: v === "_none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Any</SelectItem>
                  <SelectItem value="Online">Online</SelectItem>
                  <SelectItem value="Hybrid">Hybrid</SelectItem>
                  <SelectItem value="InPerson">In Person</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Meeting Day {isFacilitatorTimothy && <span className="text-destructive">*</span>}</Label>
              <Select value={form.scheduleDayOfWeek} onValueChange={(v) => setForm((f) => ({ ...f, scheduleDayOfWeek: v === "_none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Any</SelectItem>
                  {DAYS_OF_WEEK.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Meeting Time {isFacilitatorTimothy && <span className="text-destructive">*</span>}</Label>
              <TimeInput
                value={form.scheduleTimeStart}
                onChange={(v) => setForm((f) => ({ ...f, scheduleTimeStart: v }))}
              />
            </div>
          </div>
        </div>

        <DrawerFooter>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export function GroupActions({
  group,
  eventId,
  lifeStages,
  volunteers,
}: {
  group: EditableGroupData
  eventId: string
  lifeStages: { id: string; name: string }[]
  volunteers: Volunteer[]
}) {
  const router = useRouter()
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteBreakoutGroup(group.id, eventId)
    setDeleting(false)
    if (result.success) {
      toast.success("Breakout group deleted")
      router.push(`/event/${eventId}/breakouts`)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        <IconPencil className="size-4" />
        Edit
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setDeleteOpen(true)}
      >
        <IconTrash className="size-4" />
        Delete
      </Button>

      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        group={group}
        eventId={eventId}
        lifeStages={lifeStages}
        volunteers={volunteers}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete breakout group?</DialogTitle>
            <DialogDescription>
              This will remove <span className="font-medium">{group.name}</span> and all its member
              assignments. Registrants will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
