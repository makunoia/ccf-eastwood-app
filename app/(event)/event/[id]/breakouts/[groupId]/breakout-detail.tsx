"use client"

import * as React from "react"
import Link from "next/link"
import {
  IconCheck,
  IconPencil,
  IconPlus,
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
  removeRegistrantFromBreakout,
  addRegistrantToBreakout,
  setFacilitator,
} from "@/app/(dashboard)/events/breakout-actions"

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
  smallGroupStatus: { id: string; name: string } | null
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

// ─── Facilitator small group card ───────────────────────────────────────────────

function SmallGroupCard({ group }: { group: LedGroup }) {
  const parts: string[] = []
  if (group.lifeStage) parts.push(group.lifeStage.name)
  if (group.genderFocus) parts.push(GENDER_FOCUS_LABELS[group.genderFocus] ?? group.genderFocus)
  if (group.language.length > 0) parts.push(group.language.join(", "))
  if (group.ageRangeMin != null || group.ageRangeMax != null) {
    parts.push(`Ages ${group.ageRangeMin ?? "?"}–${group.ageRangeMax ?? "+"}`)
  }
  if (group.meetingFormat) parts.push(MEETING_FORMAT_LABELS[group.meetingFormat] ?? group.meetingFormat)
  if (group.locationCity) parts.push(group.locationCity)

  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-sm font-medium">{group.name}</p>
      {parts.length > 0 && (
        <p className="text-xs text-muted-foreground mt-0.5">{parts.join(" · ")}</p>
      )}
    </div>
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
  const [selectedId, setSelectedId] = React.useState(volunteer?.id ?? "")
  const [linkedGroupId, setLinkedGroupId] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const eligible = availableVolunteers.filter((v) => v.id !== otherVolunteerId)
  const selectedVol = eligible.find((v) => v.id === selectedId) ?? null
  const ledGroups = selectedVol?.member.ledGroups ?? []

  React.useEffect(() => {
    if (dialogOpen) {
      setSelectedId(volunteer?.id ?? "")
      setLinkedGroupId("")
    }
  }, [dialogOpen, volunteer])

  React.useEffect(() => {
    if (ledGroups.length === 1) setLinkedGroupId(ledGroups[0].id)
    else setLinkedGroupId("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  async function handleSave() {
    setSaving(true)
    const result = await setFacilitator(
      groupId,
      selectedId || null,
      role,
      eventId,
      role === "facilitator" ? (linkedGroupId || null) : undefined
    )
    setSaving(false)
    if (result.success) {
      toast.success(`${label} updated`)
      setDialogOpen(false)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
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
                <SelectItem value="">Unassigned</SelectItem>
                {eligible.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.member.firstName} {v.member.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {role === "facilitator" && selectedId && ledGroups.length > 1 && (
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

// ─── Members table ──────────────────────────────────────────────────────────────

function MembersTable({
  members,
  groupId,
  eventId,
  unassignedRegistrants,
  memberLimit,
}: {
  members: BreakoutMemberRow[]
  groupId: string
  eventId: string
  unassignedRegistrants: UnassignedRegistrant[]
  memberLimit: number | null
}) {
  const [removingId, setRemovingId] = React.useState<string | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)

  async function handleRemove(registrantId: string) {
    setRemovingId(registrantId)
    const result = await removeRegistrantFromBreakout(groupId, registrantId, eventId)
    setRemovingId(null)
    if (!result.success) toast.error(result.error)
  }

  const isFull = memberLimit != null && members.length >= memberLimit

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

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Small Group</TableHead>
              <TableHead>SG Status</TableHead>
              <TableHead>Attended</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground text-sm">
                  No members assigned yet.
                </TableCell>
              </TableRow>
            ) : (
              members.map((m) => {
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
                      {r.member?.smallGroup ? (
                        <span className="text-sm">{r.member.smallGroup.name}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.member?.smallGroupStatus ? (
                        <Badge variant="secondary" className="text-xs">
                          {r.member.smallGroupStatus.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.attendedAt ? (
                        <span className="flex items-center gap-1 text-sm text-green-600">
                          <IconCheck className="size-4" />
                          Attended
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
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
  const profileParts: string[] = []
  if (group.lifeStage) profileParts.push(group.lifeStage.name)
  if (group.genderFocus) profileParts.push(GENDER_FOCUS_LABELS[group.genderFocus] ?? group.genderFocus)
  if (group.language.length > 0) profileParts.push(group.language.join(", "))
  if (group.ageRangeMin != null || group.ageRangeMax != null) {
    profileParts.push(`Ages ${group.ageRangeMin ?? "?"}–${group.ageRangeMax ?? "+"}`)
  }
  if (group.meetingFormat) profileParts.push(MEETING_FORMAT_LABELS[group.meetingFormat] ?? group.meetingFormat)
  if (group.locationCity) profileParts.push(group.locationCity)

  return (
    <div className="space-y-6">
      {/* Matching profile */}
      {profileParts.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Matching Profile</p>
          <p className="text-sm">{profileParts.join(" · ")}</p>
          {group.linkedSmallGroup && (
            <p className="text-sm mt-1">
              <span className="text-muted-foreground">Linked Small Group: </span>
              {group.linkedSmallGroup.name}
            </p>
          )}
        </div>
      )}

      {profileParts.length > 0 && <Separator />}

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

      {/* Members */}
      <MembersTable
        members={group.members}
        groupId={group.id}
        eventId={group.eventId}
        unassignedRegistrants={unassignedRegistrants}
        memberLimit={group.memberLimit}
      />
    </div>
  )
}
