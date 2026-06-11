"use client"

import * as React from "react"
import Link from "next/link"
import {
  IconCheck,
  IconPencil,
  IconUser,
  IconUserPlus,
  IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FilterBar, FilterField } from "@/components/filter-bar"
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
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  removeRegistrantFromBreakout,
  addRegistrantToBreakout,
  setFacilitator,
} from "@/app/(dashboard)/events/breakout-actions"

const UNASSIGNED = "__unassigned__"

// ─── Types ─────────────────────────────────────────────────────────────────────

type LedGroup = {
  id: string
  name: string
  lifeStage: { id: string; name: string } | null
  genderFocus: string | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: string | null
  locationCity: string | null
  scheduleDayOfWeek: number | null
  scheduleTimeStart: string | null
}

type FacilitatorVolunteer = {
  id: string
  member: {
    id: string
    firstName: string
    lastName: string
    ledGroups: LedGroup[]
  }
}

type RegistrantMember = {
  id: string
  firstName: string
  lastName: string
  smallGroup: { id: string; name: string } | null
  groupStatus: "Member" | "Timothy" | "Leader" | null
}

type BreakoutMemberRow = {
  registrantId: string
  assignedAt: Date
  registrant: {
    id: string
    memberId: string | null
    guestId: string | null
    firstName: string | null
    lastName: string | null
    nickname: string | null
    mobileNumber: string | null
    attendedAt: Date | null
    occurrenceAttendances: { occurrence: { date: Date } }[]
    member: RegistrantMember | null
    guest: { id: string; firstName: string; lastName: string } | null
  }
}

type UnassignedRegistrant = {
  id: string
  memberId: string | null
  guestId: string | null
  firstName: string | null
  lastName: string | null
  nickname: string | null
  mobileNumber: string | null
  member: { id: string; firstName: string; lastName: string } | null
  guest: { id: string; firstName: string; lastName: string } | null
}

type AvailableVolunteer = {
  id: string
  member: { id: string; firstName: string; lastName: string; ledGroups: { id: string; name: string }[] }
}

export type BreakoutDetailData = {
  id: string
  eventId: string
  name: string
  facilitatorId: string | null
  facilitator: FacilitatorVolunteer | null
  coFacilitatorId: string | null
  coFacilitator: FacilitatorVolunteer | null
  linkedSmallGroupId: string | null
  linkedSmallGroup: { id: string; name: string } | null
  lifeStage: { id: string; name: string } | null
  genderFocus: string | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: string | null
  locationCity: string | null
  memberLimit: number | null
  members: BreakoutMemberRow[]
  schedules: { dayOfWeek: number; timeStart: string }[]
  eventType: string
  totalOccurrences: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function registrantDisplayName(r: {
  memberId: string | null
  firstName: string | null
  lastName: string | null
  member: { firstName: string; lastName: string } | null
  guest: { firstName: string; lastName: string } | null
}) {
  if (r.member) return `${r.member.firstName} ${r.member.lastName}`
  if (r.guest) return `${r.guest.firstName} ${r.guest.lastName}`
  return [r.firstName, r.lastName].filter(Boolean).join(" ") || "Unknown"
}

const MEETING_FORMAT_LABELS: Record<string, string> = {
  Online: "Online",
  Hybrid: "Hybrid",
  InPerson: "In-Person",
}

const GENDER_FOCUS_LABELS: Record<string, string> = {
  Male: "Male",
  Female: "Female",
  Mixed: "Mixed",
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function formatTime(t: string) {
  const [hStr, mStr] = t.split(":")
  const h = parseInt(hStr)
  const ampm = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${mStr} ${ampm}`
}

// ─── Facilitator small group card ───────────────────────────────────────────────

function SmallGroupCard({ group }: { group: LedGroup }) {
  const [open, setOpen] = React.useState(false)

  const details: { label: string; value: string }[] = []
  if (group.lifeStage) details.push({ label: "Life Stage", value: group.lifeStage.name })
  if (group.genderFocus) details.push({ label: "Gender Focus", value: GENDER_FOCUS_LABELS[group.genderFocus] ?? group.genderFocus })
  if (group.language.length > 0) details.push({ label: "Language", value: group.language.join(", ") })
  if (group.ageRangeMin != null || group.ageRangeMax != null) {
    details.push({ label: "Age Range", value: `${group.ageRangeMin ?? "?"}–${group.ageRangeMax ?? "+"}` })
  }
  if (group.meetingFormat) details.push({ label: "Format", value: MEETING_FORMAT_LABELS[group.meetingFormat] ?? group.meetingFormat })
  if (group.locationCity) details.push({ label: "Location", value: group.locationCity })
  if (group.scheduleDayOfWeek != null && group.scheduleTimeStart) {
    details.push({ label: "Schedule", value: `${DAY_LABELS[group.scheduleDayOfWeek]} ${formatTime(group.scheduleTimeStart)}` })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors text-left"
      >
        {group.name}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{group.name}</SheetTitle>
            <SheetDescription>Small group profile</SheetDescription>
          </SheetHeader>

          {details.length > 0 ? (
            <div className="px-4 pb-6 space-y-4">
              <Separator />
              <dl className="space-y-3">
                {details.map((d) => (
                  <div key={d.label} className="flex gap-3">
                    <dt className="w-28 shrink-0 text-xs text-muted-foreground pt-0.5">{d.label}</dt>
                    <dd className="text-sm">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <p className="px-4 text-sm text-muted-foreground">No profile details set for this group.</p>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

// ─── Facilitator section ────────────────────────────────────────────────────────

function FacilitatorSection({
  label,
  volunteer,
  groupId,
  eventId,
  role,
  otherVolunteerId,
  availableVolunteers,
}: {
  label: string
  volunteer: FacilitatorVolunteer | null
  groupId: string
  eventId: string
  role: "facilitator" | "coFacilitator"
  otherVolunteerId: string | null
  availableVolunteers: AvailableVolunteer[]
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [selectedId, setSelectedId] = React.useState(volunteer?.id ?? UNASSIGNED)
  const [linkedGroupId, setLinkedGroupId] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const eligible = availableVolunteers.filter((v) => v.id !== otherVolunteerId)
  const selectedVol = eligible.find((v) => v.id === selectedId) ?? null
  const ledGroups = selectedVol?.member.ledGroups ?? []

  React.useEffect(() => {
    if (dialogOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId(volunteer?.id ?? UNASSIGNED)
      setLinkedGroupId("")
    }
  }, [dialogOpen, volunteer])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ledGroups.length === 1) setLinkedGroupId(ledGroups[0].id)
    else setLinkedGroupId("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  async function handleSave() {
    setSaving(true)
    try {
      const volunteerId = selectedId === UNASSIGNED ? null : selectedId
      const result = await setFacilitator(
        groupId,
        volunteerId,
        role,
        eventId,
        role === "facilitator" ? (linkedGroupId || null) : undefined
      )
      if (result.success) {
        toast.success(`${label} updated`)
        setDialogOpen(false)
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("Failed to update facilitator")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="type-label text-muted-foreground">{label}</p>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setDialogOpen(true)}>
          <IconPencil className="size-3" />
          Change
        </Button>
      </div>

      {volunteer ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-muted">
              <IconUser className="size-4 text-muted-foreground" />
            </div>
            <span className="font-medium text-sm">
              {volunteer.member.firstName} {volunteer.member.lastName}
            </span>
          </div>
          {volunteer.member.ledGroups.length > 0 && (
            <div className="ml-10 space-y-1.5">
              <p className="text-xs text-muted-foreground">Leads {volunteer.member.ledGroups.length === 1 ? "this small group" : "these small groups"}:</p>
              {volunteer.member.ledGroups.map((g) => (
                <SmallGroupCard key={g.id} group={g} />
              ))}
            </div>
          )}
          {volunteer.member.ledGroups.length === 0 && (
            <p className="ml-10 text-xs text-muted-foreground">Does not lead a small group</p>
          )}
        </div>
      ) : (
        <button
          className="flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
          onClick={() => setDialogOpen(true)}
        >
          <IconUser className="size-4" />
          Unassigned — click to assign
        </button>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign {label}</DialogTitle>
            <DialogDescription>
              Select a confirmed volunteer for the {label.toLowerCase()} slot.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Volunteer</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {eligible.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.member.firstName} {v.member.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {role === "facilitator" && selectedId !== UNASSIGNED && ledGroups.length > 1 && (
            <div className="space-y-1.5">
              <Label>Linked small group <span className="text-muted-foreground font-normal">(for DGroup assignment)</span></Label>
              <Select value={linkedGroupId} onValueChange={setLinkedGroupId}>
                <SelectTrigger><SelectValue placeholder="Select a group…" /></SelectTrigger>
                <SelectContent>
                  {ledGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Add registrant dialog ──────────────────────────────────────────────────────

function AddRegistrantDialog({
  open,
  onOpenChange,
  groupId,
  eventId,
  unassignedRegistrants,
  memberLimit,
  memberCount,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  groupId: string
  eventId: string
  unassignedRegistrants: UnassignedRegistrant[]
  memberLimit: number | null
  memberCount: number
}) {
  const [search, setSearch] = React.useState("")
  const [assigning, setAssigning] = React.useState<string | null>(null)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => { if (open) setSearch("") }, [open])

  const filtered = unassignedRegistrants.filter((r) => {
    const name = registrantDisplayName(r).toLowerCase()
    const mobile = r.mobileNumber ?? ""
    return name.includes(search.toLowerCase()) || mobile.includes(search)
  })

  const isFull = memberLimit != null && memberCount >= memberLimit

  async function handleAssign(registrantId: string) {
    setAssigning(registrantId)
    const result = await addRegistrantToBreakout(groupId, registrantId, eventId)
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
          <DialogTitle>Add registrant</DialogTitle>
          <DialogDescription>
            {isFull
              ? "This group is at capacity."
              : `${unassignedRegistrants.length} unassigned registrant${unassignedRegistrants.length !== 1 ? "s" : ""} available.`}
          </DialogDescription>
        </DialogHeader>
        {!isFull && (
          <>
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
                filtered.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded px-2 py-2 hover:bg-muted/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium truncate">{registrantDisplayName(r)}</span>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {r.memberId ? "Member" : "Guest"}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={assigning === r.id}
                      onClick={() => handleAssign(r.id)}
                    >
                      {assigning === r.id ? "Adding…" : "Add"}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Occurrence attendance cell ─────────────────────────────────────────────────

function OccurrenceAttendanceCell({
  attendances,
  total,
  eventType,
}: {
  attendances: { occurrence: { date: Date } }[]
  total: number
  eventType: string
}) {
  const count = attendances.length
  const unit = eventType === "MultiDay" ? "day" : "session"

  if (count === 0) {
    return <span className="text-muted-foreground text-sm">—</span>
  }

  const dateList = attendances.map((a) =>
    new Date(a.occurrence.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  )

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-sm text-green-600 cursor-default">
            <IconCheck className="size-4" />
            {total > 0 ? `${count} / ${total} ${unit}${total !== 1 ? "s" : ""}` : `${count} ${unit}${count !== 1 ? "s" : ""}`}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-48 text-xs">
          <p className="font-medium mb-1">Attended {unit}s:</p>
          <ul className="space-y-0.5">
            {dateList.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ─── Members table ──────────────────────────────────────────────────────────────

function MembersTable({
  members,
  groupId,
  eventId,
  unassignedRegistrants,
  eventType,
  totalOccurrences,
  memberLimit,
}: {
  members: BreakoutMemberRow[]
  groupId: string
  eventId: string
  unassignedRegistrants: UnassignedRegistrant[]
  eventType: string
  totalOccurrences: number
  memberLimit: number | null
}) {
  const [search, setSearch] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<"all" | "member" | "guest">("all")
  const [attendanceFilter, setAttendanceFilter] = React.useState<"all" | "attended" | "not-attended">("all")
  const [removingId, setRemovingId] = React.useState<string | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)

  async function handleRemove(registrantId: string) {
    setRemovingId(registrantId)
    const result = await removeRegistrantFromBreakout(groupId, registrantId, eventId)
    setRemovingId(null)
    if (!result.success) toast.error(result.error)
  }

  const isFull = memberLimit != null && members.length >= memberLimit

  const filteredMembers = members.filter((m) => {
    const r = m.registrant
    const name = registrantDisplayName(r).toLowerCase()
    const mobile = (r.mobileNumber ?? "").toLowerCase()
    const query = search.trim().toLowerCase()
    if (query && !name.includes(query) && !mobile.includes(query)) return false

    const isMember = !!r.memberId
    if (typeFilter === "member" && !isMember) return false
    if (typeFilter === "guest" && isMember) return false

    const hasAttendance =
      eventType === "OneTime"
        ? !!r.attendedAt
        : r.occurrenceAttendances.length > 0

    if (attendanceFilter === "attended" && !hasAttendance) return false
    if (attendanceFilter === "not-attended" && hasAttendance) return false

    return true
  })

  const attendanceHeader =
    eventType === "OneTime" ? "Attended" : eventType === "MultiDay" ? "Days Attended" : "Sessions Attended"

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          Members{" "}
          <span className="font-normal text-muted-foreground text-sm">
            ({memberLimit != null ? `${members.length} / ${memberLimit}` : members.length})
          </span>
        </h3>
        {!isFull && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <IconUserPlus className="size-4" />
            Add Registrant
          </Button>
        )}
      </div>

      <FilterBar
        searchValue={search}
        searchPlaceholder="Search name or mobile"
        onSearch={setSearch}
        activeCount={[typeFilter, attendanceFilter].filter((v) => v !== "all").length}
        hasActive={
          Boolean(search) || typeFilter !== "all" || attendanceFilter !== "all"
        }
        onClear={() => {
          setSearch("")
          setTypeFilter("all")
          setAttendanceFilter("all")
        }}
      >
        <FilterField label="Type">
          <Select
            value={typeFilter}
            onValueChange={(v) => setTypeFilter(v as "all" | "member" | "guest")}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="member">Members</SelectItem>
              <SelectItem value="guest">Guests</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>

        <FilterField label="Attendance">
          <Select
            value={attendanceFilter}
            onValueChange={(v) =>
              setAttendanceFilter(v as "all" | "attended" | "not-attended")
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Attendance</SelectItem>
              <SelectItem value="attended">Attended</SelectItem>
              <SelectItem value="not-attended">Not Attended</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
      </FilterBar>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>{attendanceHeader}</TableHead>
              <TableHead>Small Group</TableHead>
              <TableHead>SG Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground text-sm">
                  {members.length === 0 ? "No members assigned yet." : "No members match current filters."}
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers.map((m) => {
                const r = m.registrant
                const isMember = !!r.memberId
                const name = registrantDisplayName(r)

                return (
                  <TableRow key={m.registrantId}>
                    <TableCell>
                      <Link
                        href={`/event/${eventId}/registrants/${r.id}`}
                        className="font-medium underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                      >
                        {name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {isMember ? "Member" : "Guest"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {eventType === "OneTime" ? (
                        r.attendedAt ? (
                          <span className="flex items-center gap-1 text-sm text-green-600">
                            <IconCheck className="size-4" />
                            Attended
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )
                      ) : (
                        <OccurrenceAttendanceCell
                          attendances={r.occurrenceAttendances}
                          total={totalOccurrences}
                          eventType={eventType}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {r.member?.smallGroup ? (
                        <span className="text-sm">{r.member.smallGroup.name}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.member?.groupStatus ? (
                        <Badge variant="secondary" className="text-xs">
                          {r.member.groupStatus}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        disabled={removingId === m.registrantId}
                        onClick={() => handleRemove(m.registrantId)}
                        title="Remove from group"
                      >
                        <IconX className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AddRegistrantDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        groupId={groupId}
        eventId={eventId}
        unassignedRegistrants={unassignedRegistrants}
        memberLimit={memberLimit}
        memberCount={members.length}
      />
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function BreakoutDetail({
  group,
  unassignedRegistrants,
  availableVolunteers,
}: {
  group: BreakoutDetailData
  unassignedRegistrants: UnassignedRegistrant[]
  availableVolunteers: AvailableVolunteer[]
}) {
  return (
    <div className="space-y-6">
      {/* Facilitators */}
      <div className="grid gap-6 sm:grid-cols-2">
        <FacilitatorSection
          label="Facilitator"
          volunteer={group.facilitator}
          groupId={group.id}
          eventId={group.eventId}
          role="facilitator"
          otherVolunteerId={group.coFacilitatorId}
          availableVolunteers={availableVolunteers}
        />
        <FacilitatorSection
          label="Co-Facilitator"
          volunteer={group.coFacilitator}
          groupId={group.id}
          eventId={group.eventId}
          role="coFacilitator"
          otherVolunteerId={group.facilitatorId}
          availableVolunteers={availableVolunteers}
        />
      </div>

      <Separator />

      <MembersTable
        members={group.members}
        groupId={group.id}
        eventId={group.eventId}
        unassignedRegistrants={unassignedRegistrants}
        eventType={group.eventType}
        totalOccurrences={group.totalOccurrences}
        memberLimit={group.memberLimit}
      />
    </div>
  )
}
