"use client"

import * as React from "react"
import Link from "next/link"
import {
  IconAlertTriangle,
  IconArrowsExchange,
  IconCheck,
  IconDots,
  IconPencil,
  IconTrash,
  IconUser,
  IconUserPlus,
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  removeRegistrantFromBreakout,
  setFacilitator,
  transferRegistrantToBreakout,
} from "@/app/(dashboard)/events/breakout-actions"
import { AddRegistrantSheet } from "./add-registrant-sheet"
import { MatchingProfile } from "@/components/breakouts/matching-profile"
import { CatchMechGroupField } from "@/components/breakouts/catch-mech-group-field"
import { breakoutOccupancy } from "@/lib/breakouts/occupancy"
import type { BreakoutSurface } from "@/lib/breakouts/owner"

const UNASSIGNED = "__unassigned__"

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Shown, not inherited — a breakout group's criteria are its own. */
type LedGroup = {
  id: string
  name: string
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
    /**
     * The event this registration belongs to. Carried per row because a
     * cluster-owned table (CCF-148) seats people from either member event, and
     * their registrant detail page lives in their own event's workspace — the
     * table's surface cannot supply it.
     */
    eventId: string
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

/** Another breakout group in the same event — a transfer target. */
export type SiblingGroup = {
  id: string
  name: string
  memberLimit: number | null
  memberCount: number
}

type AvailableVolunteer = {
  id: string
  member: { id: string; firstName: string; lastName: string; ledGroups: { id: string; name: string }[] }
}

export type BreakoutDetailData = {
  id: string
  /** Null when a Collab cluster owns the table (CCF-148). */
  eventId: string | null
  name: string
  facilitatorId: string | null
  facilitator: FacilitatorVolunteer | null
  coFacilitatorId: string | null
  coFacilitator: FacilitatorVolunteer | null
  linkedSmallGroupId: string | null
  linkedSmallGroup: { id: string; name: string } | null
  lifeStages: { id: string; name: string }[]
  genderFocus: string | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  memberLimit: number | null
  members: BreakoutMemberRow[]
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

// ─── Facilitator cell ───────────────────────────────────────────────────────────

/**
 * One half of the profile card's top row: who holds the slot, and one control to
 * change them. Nothing else.
 *
 * "Change" sits in the person's own row rather than opposite the section label:
 * on a wide screen that put the control the better part of a metre away from the
 * name it changes, with nothing between them.
 *
 * The DGroups a facilitator leads, and which of them Catch Mech routes to, are
 * deliberately absent. They are settings, not identity — they belong where they
 * are decided (the assign dialog and the edit drawer, which both still show
 * them), and on a card whose job is "who runs this group" they were two lines of
 * fine print per person for a fact nobody reads here.
 */
function FacilitatorCell({
  label,
  volunteer,
  groupId,
  surface,
  role,
  otherVolunteerId,
  availableVolunteers,
}: {
  label: string
  volunteer: FacilitatorVolunteer | null
  groupId: string
  surface: BreakoutSurface
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
        surface.owner,
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
    <div className="bg-card p-5">
      <p className="type-label text-muted-foreground">{label}</p>

      {volunteer ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
            <IconUser className="size-4 text-muted-foreground" />
          </div>
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {volunteer.member.firstName} {volunteer.member.lastName}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 h-7 shrink-0 gap-1.5 text-xs"
            onClick={() => setDialogOpen(true)}
          >
            <IconPencil className="size-3" />
            Change
          </Button>
        </div>
      ) : (
        // No "Change" button alongside this one: the empty slot *is* the control.
        <button
          className="mt-3 flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          onClick={() => setDialogOpen(true)}
        >
          <IconUserPlus className="size-4" />
          Assign a {label.toLowerCase()}
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
          {/* Unassigning is destructive by side effect — the action clears the
              group's criteria and Catch Mech target with the facilitator. Say so
              before the save, not after. */}
          {role === "facilitator" && selectedId === UNASSIGNED && volunteer && (
            <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
              <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Unassigning also clears this group&apos;s matching profile and its
                Catch Mech DGroup.
              </span>
            </p>
          )}
          {role === "facilitator" && selectedId !== UNASSIGNED && ledGroups.length > 1 && (
            <CatchMechGroupField
              id="assign-catch-mech"
              ledGroups={ledGroups}
              value={linkedGroupId}
              onValueChange={setLinkedGroupId}
            />
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
  surface,
  eventType,
  totalOccurrences,
  memberLimit,
  siblingGroups,
}: {
  members: BreakoutMemberRow[]
  groupId: string
  surface: BreakoutSurface
  eventType: string
  totalOccurrences: number
  memberLimit: number | null
  siblingGroups: SiblingGroup[]
}) {
  const [search, setSearch] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<"all" | "member" | "guest">("all")
  const [attendanceFilter, setAttendanceFilter] = React.useState<"all" | "attended" | "not-attended">("all")
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)
  const [confirmRemove, setConfirmRemove] = React.useState<BreakoutMemberRow | null>(null)
  const [transferRow, setTransferRow] = React.useState<BreakoutMemberRow | null>(null)

  async function handleRemove(row: BreakoutMemberRow) {
    setPendingId(row.registrantId)
    const result = await removeRegistrantFromBreakout(groupId, row.registrantId, surface.owner)
    setPendingId(null)
    if (result.success) {
      setConfirmRemove(null)
      toast.success(`${registrantDisplayName(row.registrant)} removed from this group`)
    } else {
      toast.error(result.error)
    }
  }

  async function handleTransfer(row: BreakoutMemberRow, target: SiblingGroup) {
    setPendingId(row.registrantId)
    const result = await transferRegistrantToBreakout(
      groupId,
      target.id,
      row.registrantId,
      surface.owner
    )
    setPendingId(null)
    if (result.success) {
      setTransferRow(null)
      toast.success(`${registrantDisplayName(row.registrant)} moved to ${target.name}`)
    } else {
      toast.error(result.error)
    }
  }

  const occupancy = breakoutOccupancy({ memberCount: members.length, memberLimit })
  const isFull = occupancy.isFull

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
      <h3 className="font-semibold">
        Members{" "}
        <span className="font-normal text-muted-foreground text-sm">
          ({occupancy.label})
        </span>
      </h3>

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
        actions={
          !isFull && (
            <Button variant="outline" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <IconUserPlus className="size-4" />
              <span className="sr-only sm:not-sr-only">Add Registrant</span>
            </Button>
          )
        }
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
              <TableHead>DGroup</TableHead>
              <TableHead>SG Status</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
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
                        href={`/event/${r.eventId}/registrants/${r.id}`}
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            disabled={pendingId === m.registrantId}
                          >
                            <span className="sr-only">Open menu</span>
                            <IconDots className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => setTransferRow(m)}
                            disabled={siblingGroups.length === 0}
                          >
                            <IconArrowsExchange className="mr-2 size-4" />
                            Transfer to another breakout group…
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => setConfirmRemove(m)}
                            className="text-destructive focus:text-destructive"
                          >
                            <IconTrash className="mr-2 size-4" />
                            Remove from group
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AddRegistrantSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        groupId={groupId}
        surface={surface}
      />

      <Dialog
        open={confirmRemove !== null}
        onOpenChange={(v) => !v && setConfirmRemove(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove from group?</DialogTitle>
            <DialogDescription>
              {confirmRemove && (
                <>
                  <span className="font-medium">
                    {registrantDisplayName(confirmRemove.registrant)}
                  </span>{" "}
                  will be removed from this breakout group. Any pending DGroup request
                  raised by this placement is cancelled. They stay registered for the event.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmRemove(null)}
              disabled={pendingId !== null}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pendingId !== null}
              onClick={() => confirmRemove && handleRemove(confirmRemove)}
            >
              {pendingId !== null ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransferDialog
        row={transferRow}
        siblingGroups={siblingGroups}
        pending={pendingId !== null}
        onClose={() => setTransferRow(null)}
        onTransfer={handleTransfer}
      />
    </div>
  )
}

// ─── Transfer dialog ────────────────────────────────────────────────────────────

function TransferDialog({
  row,
  siblingGroups,
  pending,
  onClose,
  onTransfer,
}: {
  row: BreakoutMemberRow | null
  siblingGroups: SiblingGroup[]
  pending: boolean
  onClose: () => void
  onTransfer: (row: BreakoutMemberRow, target: SiblingGroup) => void
}) {
  return (
    <Dialog open={row !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer to another breakout group</DialogTitle>
          <DialogDescription>
            {row && (
              <>
                Move{" "}
                <span className="font-medium">
                  {registrantDisplayName(row.registrant)}
                </span>{" "}
                in one step — they are never left without a group.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto -mx-1 px-1 space-y-1.5">
          {siblingGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              This event has no other breakout groups.
            </p>
          ) : (
            siblingGroups.map((g) => {
              const full = g.memberLimit != null && g.memberCount >= g.memberLimit
              return (
                <button
                  key={g.id}
                  disabled={full || pending}
                  onClick={() => row && onTransfer(row, g)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50 disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                >
                  <span className="text-sm font-medium">{g.name}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {g.memberLimit != null
                        ? `${g.memberCount} / ${g.memberLimit}`
                        : `${g.memberCount} · no cap`}
                    </span>
                    {full && (
                      <Badge variant="secondary" className="text-xs">
                        Full
                      </Badge>
                    )}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function BreakoutDetail({
  group,
  surface,
  availableVolunteers,
  siblingGroups,
}: {
  group: BreakoutDetailData
  surface: BreakoutSurface
  availableVolunteers: AvailableVolunteer[]
  siblingGroups: SiblingGroup[]
}) {
  return (
    <div className="space-y-6">
      {/* Who runs this group and what it matches for — one card, because they
          are one answer. As three unbounded sections stacked on the page they
          read as three unrelated blocks, and each section's action floated off
          at the far right of an otherwise empty row. The hairline gaps come from
          `gap-px` over the border colour: the cells paint their own background,
          the grid's shows through between them. */}
      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="grid gap-px bg-border sm:grid-cols-2">
          <FacilitatorCell
            label="Facilitator"
            volunteer={group.facilitator}
            groupId={group.id}
            surface={surface}
            role="facilitator"
            otherVolunteerId={group.coFacilitatorId}
            availableVolunteers={availableVolunteers}
          />
          <FacilitatorCell
            label="Co-Facilitator"
            volunteer={group.coFacilitator}
            groupId={group.id}
            surface={surface}
            role="coFacilitator"
            otherVolunteerId={group.facilitatorId}
            availableVolunteers={availableVolunteers}
          />
        </div>

        <div className="border-t p-5">
          <MatchingProfile
            profile={{
              lifeStages: group.lifeStages,
              genderFocus: group.genderFocus,
              language: group.language,
              ageRangeMin: group.ageRangeMin,
              ageRangeMax: group.ageRangeMax,
            }}
            footnote={
              group.facilitator && group.facilitator.member.ledGroups.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  This facilitator leads no DGroup yet (Timothy) — these criteria seed the
                  DGroup created for them when their first member is confirmed.
                </p>
              ) : null
            }
          />
        </div>
      </section>

      <MembersTable
        members={group.members}
        groupId={group.id}
        surface={surface}
        eventType={group.eventType}
        totalOccurrences={group.totalOccurrences}
        memberLimit={group.memberLimit}
        siblingGroups={siblingGroups}
      />
    </div>
  )
}
