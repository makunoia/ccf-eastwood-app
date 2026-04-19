"use client"

import * as React from "react"
import Link from "next/link"
import {
  IconDots,
  IconLoader,
  IconPencil,
  IconPlus,
  IconSparkles,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react"
import { type ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  createBreakoutGroup,
  updateBreakoutGroup,
  deleteBreakoutGroup,
  autoAssignBreakouts,
} from "@/app/(dashboard)/events/breakout-actions"

// ─── Types ─────────────────────────────────────────────────────────────────────

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

export type BreakoutGroupRow = {
  id: string
  name: string
  facilitatorId: string | null
  facilitator: { id: string; member: { id: string; firstName: string; lastName: string; ledGroups: LedGroup[] } } | null
  coFacilitatorId: string | null
  coFacilitator: { id: string; member: { id: string; firstName: string; lastName: string; ledGroups: LedGroup[] } } | null
  memberLimit: number | null
  memberCount: number
  linkedSmallGroupId: string | null
  linkedSmallGroup: { id: string; name: string } | null
  lifeStageId: string | null
  lifeStage: { id: string; name: string } | null
  genderFocus: string | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: string | null
  locationCity: string | null
  schedules: { dayOfWeek: number; timeStart: string }[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function volunteerName(v: { member: { firstName: string; lastName: string } }) {
  return `${v.member.firstName} ${v.member.lastName}`
}

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

// ─── Group form dialog (create / edit) ─────────────────────────────────────────

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
  scheduleDayOfWeek: "",
  scheduleTimeStart: "",
}

type GroupFormDialogProps = {
  open: boolean
  onOpenChange: (v: boolean) => void
  eventId: string
  group?: BreakoutGroupRow
  lifeStages: { id: string; name: string }[]
  volunteers: Volunteer[]
}

function GroupFormDialog({ open, onOpenChange, eventId, group, lifeStages, volunteers }: GroupFormDialogProps) {
  const isEdit = !!group
  const [form, setForm] = React.useState(EMPTY_FORM)
  const [sourceGroupId, setSourceGroupId] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setSourceGroupId(group?.linkedSmallGroupId ?? "")
      const existingSchedule = group?.schedules?.[0] ?? null
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
              scheduleDayOfWeek: existingSchedule?.dayOfWeek != null ? String(existingSchedule.dayOfWeek) : "",
              scheduleTimeStart: existingSchedule?.timeStart ?? "",
            }
          : EMPTY_FORM
      )
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

  const selectedVolunteer = volunteers.find((v) => v.id === form.facilitatorId) ?? null
  const ledGroups = selectedVolunteer?.member.ledGroups ?? []

  function field(key: keyof typeof EMPTY_FORM) {
    return {
      value: form[key] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value })),
    }
  }

  async function handleSubmit() {
    if (!form.name.trim()) { toast.error("Group name is required"); return }
    setSaving(true)
    const hasSchedule = form.scheduleDayOfWeek !== "" && form.scheduleTimeStart
    const data = {
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
          <div className="space-y-1.5">
            <Label htmlFor="bg-name">Name <span className="text-destructive">*</span></Label>
            <Input id="bg-name" placeholder="e.g. Breakout A" autoFocus {...field("name")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bg-limit">Member Limit</Label>
            <Input id="bg-limit" type="number" min={1} placeholder="Leave blank for unlimited" {...field("memberLimit")} />
          </div>

          <div className="space-y-1.5">
            <Label>Facilitator</Label>
            <Select value={form.facilitatorId} onValueChange={(v) => handleVolunteerChange(v === "_none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Unassigned</SelectItem>
                {volunteers.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{volunteerName(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.facilitatorId && ledGroups.length > 1 && (
            <div className="space-y-1.5">
              <Label>Source small group <span className="text-muted-foreground font-normal">(matching profile + DGroup assignment)</span></Label>
              <Select value={sourceGroupId} onValueChange={handleSourceGroupChange}>
                <SelectTrigger><SelectValue placeholder="Select a group…" /></SelectTrigger>
                <SelectContent>
                  {ledGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {form.facilitatorId && ledGroups.length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
              This volunteer does not lead a small group yet (Timothy). Set the profile below — it will be used to create their small group when their first member is confirmed.
            </p>
          )}

          <Separator />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {form.facilitatorId && ledGroups.length === 0
              ? <>Future Small Group Profile <span className="normal-case font-normal">(Timothy)</span></>
              : <>Matching Profile <span className="normal-case font-normal">(optional — used for auto-assign)</span></>
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
              <Label htmlFor="bg-agemin">Min Age</Label>
              <Input id="bg-agemin" type="number" min={0} placeholder="—" {...field("ageRangeMin")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bg-agemax">Max Age</Label>
              <Input id="bg-agemax" type="number" min={0} placeholder="—" {...field("ageRangeMax")} />
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
              <Input type="time" className="w-28" value={form.scheduleTimeStart} onChange={(e) => setForm((f) => ({ ...f, scheduleTimeStart: e.target.value }))} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete dialog ──────────────────────────────────────────────────────────────

function DeleteGroupDialog({
  group,
  onOpenChange,
  eventId,
}: {
  group: BreakoutGroupRow | null
  onOpenChange: (open: boolean) => void
  eventId: string
}) {
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
            This will remove <span className="font-medium">{group?.name}</span> and all its member
            assignments. Registrants will not be deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Row actions ────────────────────────────────────────────────────────────────

function RowActions({
  row,
  eventId: _eventId,
  onEdit,
  onDelete,
}: {
  row: BreakoutGroupRow
  eventId: string
  onEdit: (group: BreakoutGroupRow) => void
  onDelete: (group: BreakoutGroupRow) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <span className="sr-only">Open menu</span>
          <IconDots className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(row)}>
          <IconPencil className="mr-2 size-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onDelete(row)}
          className="text-destructive focus:text-destructive"
        >
          <IconTrash className="mr-2 size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Columns ────────────────────────────────────────────────────────────────────

function buildColumns(
  eventId: string,
  onEdit: (group: BreakoutGroupRow) => void,
  onDelete: (group: BreakoutGroupRow) => void,
): ColumnDef<BreakoutGroupRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <Link
          href={`/event/${eventId}/breakouts/${row.original.id}`}
          className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
        >
          {row.original.name}
        </Link>
      ),
    },
    {
      id: "facilitator",
      header: "Facilitator",
      accessorFn: (row) => row.facilitator ? volunteerName(row.facilitator) : "",
      cell: ({ row }) =>
        row.original.facilitator ? (
          <span>{volunteerName(row.original.facilitator)}</span>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        ),
    },
    {
      id: "linkedSmallGroup",
      header: "Linked Small Group",
      accessorFn: (row) => row.linkedSmallGroup?.name ?? "",
      cell: ({ row }) =>
        row.original.linkedSmallGroup ? (
          <span>{row.original.linkedSmallGroup.name}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "members",
      header: "Members",
      accessorFn: (row) => row.memberCount,
      cell: ({ row }) => {
        const { memberCount, memberLimit } = row.original
        return (
          <div className="flex items-center gap-1.5">
            <span>{memberLimit != null ? `${memberCount} / ${memberLimit}` : memberCount}</span>
            {memberLimit != null && memberCount >= memberLimit && (
              <Badge variant="outline" className="text-xs text-muted-foreground">Full</Badge>
            )}
          </div>
        )
      },
    },
    {
      id: "lifeStage",
      header: "Life Stage",
      accessorFn: (row) => row.lifeStage?.name ?? "",
      cell: ({ row }) =>
        row.original.lifeStage ? (
          <span>{row.original.lifeStage.name}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <RowActions
          row={row.original}
          eventId={eventId}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ),
    },
  ]
}

// ─── Main table component ───────────────────────────────────────────────────────

type Props = {
  eventId: string
  breakoutGroups: BreakoutGroupRow[]
  registrantCount: number
  unassignedCount: number
  volunteers: Volunteer[]
  lifeStages: { id: string; name: string }[]
}

export function BreakoutGroupsTable({
  eventId,
  breakoutGroups,
  registrantCount,
  unassignedCount,
  volunteers,
  lifeStages,
}: Props) {
  const [search, setSearch] = React.useState("")
  const [lifeStageFilter, setLifeStageFilter] = React.useState("_all")
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editingGroup, setEditingGroup] = React.useState<BreakoutGroupRow | null>(null)
  const [deletingGroup, setDeletingGroup] = React.useState<BreakoutGroupRow | null>(null)
  const [autoAssigning, setAutoAssigning] = React.useState(false)

  const filtered = React.useMemo(() => {
    let rows = breakoutGroups
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.facilitator && volunteerName(g.facilitator).toLowerCase().includes(q)) ||
          (g.linkedSmallGroup?.name.toLowerCase().includes(q))
      )
    }
    if (lifeStageFilter !== "_all") {
      rows = rows.filter((g) => g.lifeStageId === lifeStageFilter)
    }
    return rows
  }, [breakoutGroups, search, lifeStageFilter])

  const columns = React.useMemo(
    () => buildColumns(eventId, setEditingGroup, setDeletingGroup),
    [eventId]
  )

  async function handleAutoAssign() {
    setAutoAssigning(true)
    const result = await autoAssignBreakouts(eventId)
    setAutoAssigning(false)
    if (result.success) {
      const { assigned, skipped } = result.data
      if (assigned === 0) {
        toast.info("No registrants could be assigned — all groups may be at capacity.")
      } else if (skipped > 0) {
        toast.success(`${assigned} registrant${assigned !== 1 ? "s" : ""} assigned. ${skipped} skipped (no suitable group with capacity).`)
      } else {
        toast.success(`${assigned} registrant${assigned !== 1 ? "s" : ""} auto-assigned.`)
      }
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <Input
            placeholder="Search by name or facilitator…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={lifeStageFilter} onValueChange={setLifeStageFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Life stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All life stages</SelectItem>
              {lifeStages.map((ls) => (
                <SelectItem key={ls.id} value={ls.id}>{ls.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground hidden sm:block">
            {unassignedCount === 0 ? (
              <span className="text-foreground font-medium">All {registrantCount} registrants assigned</span>
            ) : (
              <><span className="font-medium text-foreground">{unassignedCount}</span> of {registrantCount} unassigned</>
            )}
          </p>
          {unassignedCount > 0 && breakoutGroups.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => { void handleAutoAssign() }} disabled={autoAssigning}>
              {autoAssigning ? <IconLoader className="size-4 animate-spin" /> : <IconSparkles className="size-4" />}
              {autoAssigning ? "Assigning…" : "Auto-Assign"}
            </Button>
          )}
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <IconPlus className="size-4" />
            New Group
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="hidden md:flex md:flex-1 md:flex-col">
        <DataTable
          columns={columns}
          data={filtered}
          emptyState={
            <>
              <IconUsers className="size-8" />
              <p className="text-sm">{search || lifeStageFilter !== "_all" ? "No groups match your filters." : "No breakout groups yet."}</p>
            </>
          }
        />
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-2 md:hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <IconUsers className="size-8" />
            <p className="text-sm">{search || lifeStageFilter !== "_all" ? "No groups match your filters." : "No breakout groups yet."}</p>
          </div>
        ) : (
          filtered.map((group) => (
            <Link
              key={group.id}
              href={`/event/${eventId}/breakouts/${group.id}`}
              className="rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{group.name}</p>
                <div onClick={(e) => e.stopPropagation()}>
                  <RowActions row={group} eventId={eventId} onEdit={setEditingGroup} onDelete={setDeletingGroup} />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                <span className="text-muted-foreground">Facilitator</span>
                <span>{group.facilitator ? volunteerName(group.facilitator) : <span className="text-muted-foreground">Unassigned</span>}</span>
                <span className="text-muted-foreground">Small Group</span>
                <span>{group.linkedSmallGroup?.name ?? <span className="text-muted-foreground">—</span>}</span>
                <span className="text-muted-foreground">Members</span>
                <span>{group.memberLimit != null ? `${group.memberCount} / ${group.memberLimit}` : group.memberCount}</span>
                {group.lifeStage && (
                  <>
                    <span className="text-muted-foreground">Life Stage</span>
                    <span>{group.lifeStage.name}</span>
                  </>
                )}
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Dialogs */}
      <GroupFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
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
    </div>
  )
}
