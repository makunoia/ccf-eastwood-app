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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MultiSelect } from "@/components/ui/multi-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { LANGUAGE_OPTIONS, CITY_OPTIONS } from "@/lib/constants/group-options"
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
const MEETING_FORMAT_LABELS: Record<string, string> = { Online: "Online", Hybrid: "Hybrid", InPerson: "In-Person" }

const DAY_OPTIONS = [
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
    locationCity: g.locationCity ?? "",
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
    locationCity: "",
    scheduleDayOfWeek: "",
    scheduleTimeStart: "",
  })
  const [sourceGroupId, setSourceGroupId] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
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
        locationCity: group.locationCity ?? "",
        scheduleDayOfWeek: group.schedule?.dayOfWeek != null ? String(group.schedule.dayOfWeek) : "",
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

  function field(key: string) {
    return {
      value: form[key as keyof typeof form] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Group name is required"); return }
    setSaving(true)
    const hasSchedule = form.scheduleDayOfWeek !== "" && form.scheduleTimeStart
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
      locationCity: form.locationCity || null,
      schedule: hasSchedule
        ? { dayOfWeek: Number(form.scheduleDayOfWeek), timeStart: form.scheduleTimeStart }
        : null,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit breakout group</DialogTitle>
          <DialogDescription>Update the group's details and matching profile.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
            <Select value={form.facilitatorId} onValueChange={(v) => handleVolunteerChange(v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Unassigned</SelectItem>
                {volunteers.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.member.firstName} {v.member.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          <Separator />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {form.facilitatorId && ledGroups.length === 0
              ? <>Future Small Group Profile <span className="normal-case font-normal">(Timothy — set before their first member is confirmed)</span></>
              : <>Matching Profile <span className="normal-case font-normal">(optional)</span></>
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
            <Label>Gender Focus</Label>
            <Select value={form.genderFocus} onValueChange={(v) => setForm((f) => ({ ...f, genderFocus: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Any</SelectItem>
                {Object.entries(GENDER_FOCUS_LABELS).map(([v, label]) => (
                  <SelectItem key={v} value={v}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Language</Label>
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
            <Label>Meeting Format</Label>
            <Select value={form.meetingFormat} onValueChange={(v) => setForm((f) => ({ ...f, meetingFormat: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Any</SelectItem>
                {Object.entries(MEETING_FORMAT_LABELS).map(([v, label]) => (
                  <SelectItem key={v} value={v}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Location City</Label>
            <Select value={form.locationCity} onValueChange={(v) => setForm((f) => ({ ...f, locationCity: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">No preference</SelectItem>
                {CITY_OPTIONS.map((city) => <SelectItem key={city} value={city}>{city}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Meeting Schedule</Label>
            <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
              <Select value={form.scheduleDayOfWeek} onValueChange={(v) => setForm((f) => ({ ...f, scheduleDayOfWeek: v === "_none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Day" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No day</SelectItem>
                  {DAY_OPTIONS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="time" className="w-28" {...field("scheduleTimeStart")} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
