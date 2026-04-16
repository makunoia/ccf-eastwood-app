"use client"

import * as React from "react"
import {
  IconLoader,
  IconPencil,
  IconPlus,
  IconSparkles,
  IconTrash,
  IconUser,
  IconUserPlus,
  IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
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
import { LANGUAGE_OPTIONS, CITY_OPTIONS } from "@/lib/constants/group-options"
import { Separator } from "@/components/ui/separator"
import {
  createBreakoutGroup,
  updateBreakoutGroup,
  deleteBreakoutGroup,
  addRegistrantToBreakout,
  removeRegistrantFromBreakout,
  setFacilitator,
  autoAssignBreakouts,
} from "../breakout-actions"

// ─── Types ────────────────────────────────────────────────────────────────────

type PersonName = { id: string; firstName: string; lastName: string }

type BreakoutRegistrant = {
  id: string
  memberId: string | null
  guestId: string | null
  firstName: string | null
  lastName: string | null
  nickname: string | null
  mobileNumber: string | null
  member: PersonName | null
  guest: PersonName | null
}

type BreakoutGroupMemberRow = {
  breakoutGroupId: string
  registrantId: string
  assignedAt: Date
  registrant: BreakoutRegistrant
}

type BreakoutGroup = {
  id: string
  name: string
  facilitatorId: string | null
  facilitator: { id: string; member: PersonName } | null
  coFacilitatorId: string | null
  coFacilitator: { id: string; member: PersonName } | null
  memberLimit: number | null
  lifeStageId: string | null
  lifeStage: { id: string; name: string } | null
  genderFocus: string | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: string | null
  locationCity: string | null
  members: BreakoutGroupMemberRow[]
}

type Registrant = {
  id: string
  memberId: string | null
  firstName: string | null
  lastName: string | null
  nickname: string | null
  mobileNumber: string | null
  member: PersonName | null
  guest: { id: string; firstName: string; lastName: string; phone?: string | null; email?: string | null } | null
}

type SmallGroupProfile = {
  id: string
  name: string
  lifeStageId: string | null
  genderFocus: string | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: string | null
  locationCity: string | null
}

type Volunteer = {
  id: string
  member: { id: string; firstName: string; lastName: string; smallGroup: SmallGroupProfile | null }
}

type Props = {
  eventId: string
  breakoutGroups: BreakoutGroup[]
  registrants: Registrant[]
  volunteers: Volunteer[]
  lifeStages: { id: string; name: string }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function registrantName(r: { memberId: string | null; firstName: string | null; lastName: string | null; member: PersonName | null; guest: { firstName: string; lastName: string } | null }) {
  if (r.member) return `${r.member.firstName} ${r.member.lastName}`
  if (r.guest) return `${r.guest.firstName} ${r.guest.lastName}`
  return [r.firstName, r.lastName].filter(Boolean).join(" ") || "Unknown"
}

function volunteerName(v: { member: { firstName: string; lastName: string } }) {
  return `${v.member.firstName} ${v.member.lastName}`
}

function matchingProfileSummary(group: BreakoutGroup): string {
  const parts: string[] = []
  if (group.lifeStage) parts.push(group.lifeStage.name)
  if (group.genderFocus) parts.push(group.genderFocus)
  if (group.language.length > 0) parts.push(group.language.join(", "))
  if (group.ageRangeMin != null || group.ageRangeMax != null) {
    const min = group.ageRangeMin ?? "?"
    const max = group.ageRangeMax ?? "+"
    parts.push(`Ages ${min}–${max}`)
  }
  if (group.meetingFormat) parts.push(group.meetingFormat)
  if (group.locationCity) parts.push(group.locationCity)
  return parts.join(" · ")
}

const GENDER_FOCUS_LABELS: Record<string, string> = { Male: "Male", Female: "Female", Mixed: "Mixed" }
const MEETING_FORMAT_LABELS: Record<string, string> = { Online: "Online", Hybrid: "Hybrid", InPerson: "In-Person" }

// ─── Group form dialog (create / edit) ───────────────────────────────────────

type GroupFormDialogProps = {
  open: boolean
  onOpenChange: (v: boolean) => void
  eventId: string
  group?: BreakoutGroup
  lifeStages: { id: string; name: string }[]
  volunteers: Volunteer[]
}

const EMPTY_FORM = {
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
}

function deriveProfileFromGroup(g: SmallGroupProfile) {
  return {
    lifeStageId: g.lifeStageId ?? "",
    genderFocus: g.genderFocus ?? "",
    language: g.language,
    ageRangeMin: g.ageRangeMin != null ? String(g.ageRangeMin) : "",
    ageRangeMax: g.ageRangeMax != null ? String(g.ageRangeMax) : "",
    meetingFormat: g.meetingFormat ?? "",
    locationCity: g.locationCity ?? "",
  }
}

function GroupFormDialog({ open, onOpenChange, eventId, group, lifeStages, volunteers }: GroupFormDialogProps) {
  const isEdit = !!group
  const [form, setForm] = React.useState(EMPTY_FORM)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setForm(
        group
          ? {
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
            }
          : EMPTY_FORM
      )
    }
  }, [open, group])

  function handleVolunteerChange(volunteerId: string) {
    const vol = volunteers.find((v) => v.id === volunteerId)
    if (!vol) {
      setForm((f) => ({ ...f, facilitatorId: volunteerId }))
      return
    }
    if (vol.member.smallGroup) {
      setForm((f) => ({ ...f, facilitatorId: volunteerId, ...deriveProfileFromGroup(vol.member.smallGroup!) }))
    } else {
      setForm((f) => ({ ...f, facilitatorId: volunteerId }))
    }
  }

  const selectedVolunteer = volunteers.find((v) => v.id === form.facilitatorId) ?? null

  function field(key: keyof typeof EMPTY_FORM) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    }
  }

  async function handleSubmit() {
    if (!form.name.trim()) { toast.error("Group name is required"); return }
    setSaving(true)
    const data = {
      name: form.name.trim(),
      facilitatorId: form.facilitatorId || null,
      memberLimit: form.memberLimit ? Number(form.memberLimit) : null,
      lifeStageId: form.lifeStageId || null,
      genderFocus: (form.genderFocus as "Male" | "Female" | "Mixed") || null,
      language: form.language,
      ageRangeMin: form.ageRangeMin ? Number(form.ageRangeMin) : null,
      ageRangeMax: form.ageRangeMax ? Number(form.ageRangeMax) : null,
      meetingFormat: (form.meetingFormat as "Online" | "Hybrid" | "InPerson") || null,
      locationCity: form.locationCity || null,
    }
    const result = isEdit
      ? await updateBreakoutGroup(group.id, eventId, data)
      : await createBreakoutGroup(eventId, data)
    setSaving(false)
    if (result.success) {
      toast.success(isEdit ? "Breakout group updated" : "Breakout group created")
      onOpenChange(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit breakout group" : "New breakout group"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the group's details and matching profile."
              : "Create a new group. You can assign facilitators and registrants after saving."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="bg-name">Name <span className="text-destructive">*</span></Label>
            <Input id="bg-name" placeholder="e.g. Breakout A" autoFocus {...field("name")} />
          </div>

          {/* Member limit */}
          <div className="space-y-1.5">
            <Label htmlFor="bg-limit">Member Limit</Label>
            <Input
              id="bg-limit"
              type="number"
              min={1}
              placeholder="Leave blank for unlimited"
              {...field("memberLimit")}
            />
          </div>

          {/* Facilitator */}
          <div className="space-y-1.5">
            <Label>Facilitator</Label>
            <Select
              value={form.facilitatorId}
              onValueChange={(v) => handleVolunteerChange(v === "_none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Unassigned</SelectItem>
                {volunteers.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {volunteerName(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Hint when facilitator has no small group membership */}
          {form.facilitatorId && !selectedVolunteer?.member.smallGroup && (
            <p className="text-xs text-muted-foreground">
              This volunteer does not belong to a small group — set the matching profile manually.
            </p>
          )}

          <Separator />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Matching Profile <span className="normal-case font-normal">(optional — used for auto-assign)</span>
          </p>

          {/* Life Stage */}
          <div className="space-y-1.5">
            <Label>Life Stage</Label>
            <Select
              value={form.lifeStageId}
              onValueChange={(v) => setForm((f) => ({ ...f, lifeStageId: v === "_none" ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Any</SelectItem>
                {lifeStages.map((ls) => (
                  <SelectItem key={ls.id} value={ls.id}>{ls.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Gender Focus */}
          <div className="space-y-1.5">
            <Label>Gender Focus</Label>
            <Select
              value={form.genderFocus}
              onValueChange={(v) => setForm((f) => ({ ...f, genderFocus: v === "_none" ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Any</SelectItem>
                {Object.entries(GENDER_FOCUS_LABELS).map(([v, label]) => (
                  <SelectItem key={v} value={v}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Language */}
          <div className="space-y-1.5">
            <Label>Language</Label>
            <MultiSelect
              options={LANGUAGE_OPTIONS}
              value={form.language}
              onChange={(v) => setForm((f) => ({ ...f, language: v }))}
            />
          </div>

          {/* Age range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bg-agemin">Min Age</Label>
              <Input id="bg-agemin" type="number" min={0} placeholder="—" {...field("ageRangeMin")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bg-agemax">Max Age</Label>
              <Input id="bg-agemax" type="number" min={0} placeholder="—" {...field("ageRangeMax")} />
            </div>
          </div>

          {/* Meeting format */}
          <div className="space-y-1.5">
            <Label>Meeting Format</Label>
            <Select
              value={form.meetingFormat}
              onValueChange={(v) => setForm((f) => ({ ...f, meetingFormat: v === "_none" ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Any</SelectItem>
                {Object.entries(MEETING_FORMAT_LABELS).map(([v, label]) => (
                  <SelectItem key={v} value={v}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Location city */}
          <div className="space-y-1.5">
            <Label>Location City</Label>
            <Select
              value={form.locationCity}
              onValueChange={(v) => setForm((f) => ({ ...f, locationCity: v === "_none" ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select city" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">No preference</SelectItem>
                {CITY_OPTIONS.map((city) => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Assign facilitator dialog ────────────────────────────────────────────────

type AssignFacilitatorDialogProps = {
  open: boolean
  onOpenChange: (v: boolean) => void
  eventId: string
  group: BreakoutGroup | null
  role: "facilitator" | "coFacilitator"
  volunteers: Volunteer[]
}

function AssignFacilitatorDialog({
  open, onOpenChange, eventId, group, role, volunteers,
}: AssignFacilitatorDialogProps) {
  const [selectedId, setSelectedId] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const currentId = group
    ? role === "facilitator" ? group.facilitatorId : group.coFacilitatorId
    : null

  // Filter out the volunteer already in the OTHER slot to prevent duplicates
  const otherSlotId = group
    ? role === "facilitator" ? group.coFacilitatorId : group.facilitatorId
    : null
  const eligibleVolunteers = volunteers.filter((v) => v.id !== otherSlotId)

  React.useEffect(() => {
    if (open) setSelectedId(currentId ?? "")
  }, [open, currentId])

  async function handleSave() {
    if (!group) return
    setSaving(true)
    const result = await setFacilitator(
      group.id,
      selectedId || null,
      role,
      eventId
    )
    setSaving(false)
    if (result.success) {
      toast.success(role === "facilitator" ? "Facilitator updated" : "Co-facilitator updated")
      onOpenChange(false)
    } else {
      toast.error(result.error)
    }
  }

  const roleLabel = role === "facilitator" ? "Facilitator" : "Co-Facilitator"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign {roleLabel}</DialogTitle>
          <DialogDescription>
            Select a confirmed volunteer for the {roleLabel.toLowerCase()} slot. Only volunteers confirmed for this event are shown.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Volunteer</Label>
          <Select
            value={selectedId}
            onValueChange={setSelectedId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Unassigned</SelectItem>
              {eligibleVolunteers.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {volunteerName(v)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {eligibleVolunteers.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No confirmed volunteers for this event.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Assign registrant dialog ─────────────────────────────────────────────────

type AssignRegistrantDialogProps = {
  open: boolean
  onOpenChange: (v: boolean) => void
  eventId: string
  group: BreakoutGroup | null
  unassignedRegistrants: Registrant[]
}

function AssignRegistrantDialog({
  open, onOpenChange, eventId, group, unassignedRegistrants,
}: AssignRegistrantDialogProps) {
  const [search, setSearch] = React.useState("")
  const [assigning, setAssigning] = React.useState<string | null>(null)

  React.useEffect(() => { if (open) setSearch("") }, [open])

  const filtered = unassignedRegistrants.filter((r) => {
    const name = registrantName(r).toLowerCase()
    const mobile = r.mobileNumber ?? r.member?.id ?? ""
    return name.includes(search.toLowerCase()) || mobile.includes(search)
  })

  async function handleAssign(registrantId: string) {
    if (!group) return
    setAssigning(registrantId)
    const result = await addRegistrantToBreakout(group.id, registrantId, eventId)
    setAssigning(null)
    if (result.success) {
      toast.success("Registrant added to group")
      if (unassignedRegistrants.length <= 1) onOpenChange(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add registrant to {group?.name}</DialogTitle>
          <DialogDescription>
            Showing {unassignedRegistrants.length} unassigned registrant{unassignedRegistrants.length !== 1 ? "s" : ""}.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Search by name or mobile…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        <div className="max-h-72 overflow-y-auto -mx-1 space-y-0.5">
          {filtered.length === 0 ? (
            <p className="px-1 py-4 text-sm text-center text-muted-foreground">
              {search ? "No matches" : "All registrants have been assigned"}
            </p>
          ) : (
            filtered.map((r) => {
              const isMember = !!r.memberId
              const mobile = r.mobileNumber ?? (r.member ? undefined : undefined)
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded px-2 py-2 hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">{registrantName(r)}</span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {isMember ? "Member" : "Guest"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {mobile && (
                      <span className="text-xs text-muted-foreground">{mobile}</span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={assigning === r.id}
                      onClick={() => handleAssign(r.id)}
                    >
                      {assigning === r.id ? "Adding…" : "Add"}
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete confirmation dialog ───────────────────────────────────────────────

type DeleteGroupDialogProps = {
  group: BreakoutGroup | null
  onOpenChange: (open: boolean) => void
  eventId: string
}

function DeleteGroupDialog({ group, onOpenChange, eventId }: DeleteGroupDialogProps) {
  const [deleting, setDeleting] = React.useState(false)

  async function handleDelete() {
    if (!group) return
    setDeleting(true)
    const result = await deleteBreakoutGroup(group.id, eventId)
    setDeleting(false)
    if (result.success) {
      toast.success("Breakout group deleted")
      onOpenChange(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <Dialog open={!!group} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete breakout group?</DialogTitle>
          <DialogDescription>
            This will remove{" "}
            <span className="font-medium">{group?.name}</span> and all its member
            assignments. Registrants will not be deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Group card ───────────────────────────────────────────────────────────────

type GroupCardProps = {
  group: BreakoutGroup
  eventId: string
  onEdit: (group: BreakoutGroup) => void
  onDelete: (group: BreakoutGroup) => void
  onAssignFacilitator: (group: BreakoutGroup, role: "facilitator" | "coFacilitator") => void
  onAddRegistrant: (group: BreakoutGroup) => void
}

function GroupCard({
  group, eventId, onEdit, onDelete, onAssignFacilitator, onAddRegistrant,
}: GroupCardProps) {
  const [removing, setRemoving] = React.useState<string | null>(null)
  const memberCount = group.members.length
  const limitLabel = group.memberLimit != null
    ? `${memberCount} / ${group.memberLimit}`
    : String(memberCount)
  const profileSummary = matchingProfileSummary(group)
  const isFull = group.memberLimit != null && memberCount >= group.memberLimit

  async function handleRemoveMember(registrantId: string) {
    setRemoving(registrantId)
    const result = await removeRegistrantFromBreakout(group.id, registrantId, eventId)
    setRemoving(null)
    if (!result.success) toast.error(result.error)
  }

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-xs">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{group.name}</h3>
            <Badge variant="secondary" className="text-xs">
              {limitLabel} {memberCount === 1 ? "member" : "members"}
            </Badge>
            {isFull && (
              <Badge variant="outline" className="text-xs text-muted-foreground">Full</Badge>
            )}
          </div>
          {profileSummary && (
            <p className="text-xs text-muted-foreground mt-0.5">{profileSummary}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onEdit(group)}
          >
            <IconPencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(group)}
          >
            <IconTrash className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Facilitators */}
      <div className="px-4 pb-3 flex flex-wrap gap-2">
        <button
          className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs hover:bg-muted/50 transition-colors"
          onClick={() => onAssignFacilitator(group, "facilitator")}
          title="Assign facilitator"
        >
          <IconUser className="size-3 text-muted-foreground" />
          <span className="font-medium">
            {group.facilitator
              ? volunteerName(group.facilitator)
              : <span className="text-muted-foreground">Unassigned facilitator</span>}
          </span>
        </button>
        <button
          className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs hover:bg-muted/50 transition-colors"
          onClick={() => onAssignFacilitator(group, "coFacilitator")}
          title="Assign co-facilitator"
        >
          <IconUser className="size-3 text-muted-foreground" />
          <span className="font-medium">
            {group.coFacilitator
              ? volunteerName(group.coFacilitator)
              : <span className="text-muted-foreground">No co-facilitator</span>}
          </span>
        </button>
      </div>

      <Separator />

      {/* Members list */}
      <div className="px-4 py-2">
        {group.members.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No members assigned yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {group.members.map((m) => {
              const isMember = !!m.registrant.memberId
              return (
                <li
                  key={m.registrantId}
                  className="flex items-center justify-between gap-2 py-1.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm truncate">{registrantName(m.registrant)}</span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {isMember ? "Member" : "Guest"}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={removing === m.registrantId}
                    onClick={() => handleRemoveMember(m.registrantId)}
                    title="Remove from group"
                  >
                    <IconX className="size-3" />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        {!isFull && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-7 px-2 text-xs gap-1.5"
            onClick={() => onAddRegistrant(group)}
          >
            <IconUserPlus className="size-3" />
            Add registrant
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Main tab component ───────────────────────────────────────────────────────

export function BreakoutGroupsTab({
  eventId, breakoutGroups, registrants, volunteers, lifeStages,
}: Props) {
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [editingGroup, setEditingGroup] = React.useState<BreakoutGroup | null>(null)
  const [deletingGroup, setDeletingGroup] = React.useState<BreakoutGroup | null>(null)
  const [addRegistrantFor, setAddRegistrantFor] = React.useState<BreakoutGroup | null>(null)
  const [facilitatorSlot, setFacilitatorSlot] = React.useState<{
    group: BreakoutGroup
    role: "facilitator" | "coFacilitator"
  } | null>(null)
  const [autoAssigning, setAutoAssigning] = React.useState(false)

  // Compute which registrants are already assigned to any group
  const assignedRegistrantIds = React.useMemo(() => {
    const ids = new Set<string>()
    for (const group of breakoutGroups) {
      for (const m of group.members) ids.add(m.registrantId)
    }
    return ids
  }, [breakoutGroups])

  const unassignedRegistrants = registrants.filter(
    (r) => !assignedRegistrantIds.has(r.id)
  )

  const unassignedCount = unassignedRegistrants.length
  const totalCount = registrants.length

  async function handleAutoAssign() {
    setAutoAssigning(true)
    const result = await autoAssignBreakouts(eventId)
    setAutoAssigning(false)
    if (result.success) {
      const { assigned, skipped } = result.data
      if (assigned === 0) {
        toast.info("No registrants could be assigned — all groups may be at capacity.")
      } else if (skipped > 0) {
        toast.success(
          `${assigned} registrant${assigned !== 1 ? "s" : ""} assigned. ${skipped} skipped (no suitable group with capacity).`
        )
      } else {
        toast.success(`${assigned} registrant${assigned !== 1 ? "s" : ""} auto-assigned.`)
      }
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {unassignedCount === 0 ? (
            <span className="text-foreground font-medium">All {totalCount} registrants assigned</span>
          ) : (
            <>
              <span className="font-medium text-foreground">{unassignedCount}</span> of {totalCount} registrant{totalCount !== 1 ? "s" : ""} unassigned
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          {unassignedCount > 0 && breakoutGroups.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void handleAutoAssign() }}
              disabled={autoAssigning}
            >
              {autoAssigning ? (
                <IconLoader className="size-4 animate-spin" />
              ) : (
                <IconSparkles className="size-4" />
              )}
              {autoAssigning ? "Assigning…" : "Auto-Assign"}
            </Button>
          )}
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <IconPlus className="size-4" />
            New Group
          </Button>
        </div>
      </div>

      {/* Groups */}
      {breakoutGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
          <p className="text-sm">No breakout groups yet.</p>
          <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(true)}>
            <IconPlus className="size-4" />
            Create the first group
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {breakoutGroups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              eventId={eventId}
              onEdit={setEditingGroup}
              onDelete={setDeletingGroup}
              onAssignFacilitator={(g, role) => setFacilitatorSlot({ group: g, role })}
              onAddRegistrant={setAddRegistrantFor}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <GroupFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        eventId={eventId}
        lifeStages={lifeStages}
        volunteers={volunteers}
      />
      <GroupFormDialog
        open={!!editingGroup}
        onOpenChange={(open) => { if (!open) setEditingGroup(null) }}
        eventId={eventId}
        group={editingGroup ?? undefined}
        lifeStages={lifeStages}
        volunteers={volunteers}
      />
      <DeleteGroupDialog
        group={deletingGroup}
        onOpenChange={(open) => { if (!open) setDeletingGroup(null) }}
        eventId={eventId}
      />
      <AssignFacilitatorDialog
        open={!!facilitatorSlot}
        onOpenChange={(open) => { if (!open) setFacilitatorSlot(null) }}
        eventId={eventId}
        group={facilitatorSlot?.group ?? null}
        role={facilitatorSlot?.role ?? "facilitator"}
        volunteers={volunteers}
      />
      <AssignRegistrantDialog
        open={!!addRegistrantFor}
        onOpenChange={(open) => { if (!open) setAddRegistrantFor(null) }}
        eventId={eventId}
        group={addRegistrantFor}
        unassignedRegistrants={unassignedRegistrants}
      />
    </div>
  )
}
