"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  IconArrowsExchange,
  IconClock,
  IconDeviceLaptop,
  IconDotsVertical,
  IconHeart,
  IconMapPin,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUserCircle,
  IconUsers,
  IconX,
} from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MultiSelect } from "@/components/ui/multi-select"
import { ScheduleInput } from "@/components/ui/schedule-input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PersonCombobox } from "@/components/ui/person-combobox"
import { LANGUAGE_OPTIONS, CITY_OPTIONS } from "@/lib/constants/group-options"
import {
  addCoupleToLedGroup,
  addMemberToLedGroup,
  cancelGroupChange,
  createLedGroup,
  deleteLedGroup,
  getSpouseForLedGroupMember,
  removeMemberFromLedGroup,
  requestGroupChange,
  searchMembersToAdd,
  setUpwardSatellite,
  updateLedGroupDetails,
  type MemberSearchResult,
} from "./actions"
import {
  LeaderGroupPicker,
  MEETING_FORMAT_LABELS,
  SATELLITE_OPTIONS,
  formatGroupSchedule as formatSchedule,
  type LeaderOption,
  type UpwardScope,
} from "./portal-shared"
import type { SpouseInfo } from "@/lib/family-links"
import { CouplesBadge } from "@/components/group-type-badge"

const NO_CITY = "_none"

type GroupStatus = "Member" | "Timothy" | "Leader" | null

type LedGroup = {
  id: string
  name: string
  groupType: string
  memberLimit: number | null
  meetingFormat: "Online" | "Hybrid" | "InPerson" | null
  locationCity: string | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  scheduleDayOfWeek: number | null
  scheduleTimeStart: string | null
  scheduleTimeEnd: string | null
  members: {
    id: string
    firstName: string
    lastName: string
    groupStatus: GroupStatus
    /** For Couples groups: roster memberId of this member's spouse, if also in the group. */
    spouseId: string | null
  }[]
}

type Props = {
  token: string
  member: {
    firstName: string
    nickname: string | null
    groupStatus: GroupStatus
  }
  myGroup: {
    id: string
    name: string
    scheduleDayOfWeek: number | null
    scheduleTimeStart: string | null
    scheduleTimeEnd: string | null
    leader: { firstName: string; lastName: string } | null
  } | null
  pendingRequest: { id: string; groupId: string; groupName: string } | null
  /** The CCF satellite this member's own DGroup leader belongs to, if declared. */
  upwardSatellite: string | null
  /** Whether they've answered "who is your leader?" — the gate on adding groups. */
  canAddGroup: boolean
  ledGroups: LedGroup[]
  leaderOptions: LeaderOption[]
}

export function MePortalClient({
  token,
  member,
  myGroup,
  pendingRequest,
  upwardSatellite,
  canAddGroup,
  ledGroups,
  leaderOptions,
}: Props) {
  const displayName = member.nickname || member.firstName
  const isLeader = member.groupStatus === "Leader" || ledGroups.length > 0

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="rounded-2xl border bg-background px-5 py-6 shadow-sm sm:px-7">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <IconUserCircle className="size-6" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                CCF Eastwood
              </p>
              <h1 className="text-2xl font-semibold tracking-tight">
                Hi, {displayName}
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                Keep your small-group information up to date.
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
            <IconUsers className="size-3.5" />
            {isLeader
              ? `You lead ${ledGroups.length} ${ledGroups.length === 1 ? "group" : "groups"}`
              : "Member portal"}
          </div>
        </header>

        <div className="mt-8 space-y-9">
          <MyGroupSection
            token={token}
            myGroup={myGroup}
            pendingRequest={pendingRequest}
            upwardSatellite={upwardSatellite}
            leaderOptions={leaderOptions}
          />

          <LedGroupsSection
            token={token}
            ledGroups={ledGroups}
            canAddGroup={canAddGroup}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Groups you lead ─────────────────────────────────────────────────────────

function LedGroupsSection({
  token,
  ledGroups,
  canAddGroup,
}: {
  token: string
  ledGroups: LedGroup[]
  canAddGroup: boolean
}) {
  const [createOpen, setCreateOpen] = React.useState(false)
  // Bumped each time the create dialog opens so it remounts with empty fields.
  const [createKey, setCreateKey] = React.useState(0)

  function openCreate() {
    setCreateKey((k) => k + 1)
    setCreateOpen(true)
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">
            Groups you lead
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage your groups and their members.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={openCreate}
          disabled={!canAddGroup}
        >
          <IconPlus className="size-4" />
          Add group
        </Button>
      </div>

      {!canAddGroup && (
        <p className="rounded-xl border border-dashed bg-background px-5 py-6 text-sm leading-6 text-muted-foreground">
          Tell us who your own DGroup leader is first — answer{" "}
          <span className="font-medium text-foreground">My group</span> above and
          you can add the groups you lead here.
        </p>
      )}

      {canAddGroup && ledGroups.length === 0 && (
        <p className="rounded-xl border border-dashed bg-background px-5 py-6 text-sm leading-6 text-muted-foreground">
          You don&apos;t lead any DGroups yet. Add one and you can manage its
          members from here.
        </p>
      )}

      <div className="space-y-4">
        {ledGroups.map((g) => (
          <LedGroupCard key={g.id} token={token} group={g} />
        ))}
      </div>

      <LedGroupFormDialog
        key={createKey}
        token={token}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </section>
  )
}

// ─── My Group ────────────────────────────────────────────────────────────────

function MyGroupSection({
  token,
  myGroup,
  pendingRequest,
  upwardSatellite,
  leaderOptions,
}: Pick<
  Props,
  "token" | "myGroup" | "pendingRequest" | "upwardSatellite" | "leaderOptions"
>) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [selectedLeaderId, setSelectedLeaderId] = React.useState("")
  const [selectedGroupId, setSelectedGroupId] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)
  const [scope, setScope] = React.useState<UpwardScope>(
    upwardSatellite ? "satellite" : "eastwood"
  )
  const [satellite, setSatellite] = React.useState(upwardSatellite ?? "")
  const [clearing, setClearing] = React.useState(false)

  const schedule = myGroup
    ? formatSchedule(myGroup.scheduleDayOfWeek, myGroup.scheduleTimeStart, myGroup.scheduleTimeEnd)
    : null

  function resetSelection() {
    setSelectedLeaderId("")
    setSelectedGroupId("")
    setScope(upwardSatellite ? "satellite" : "eastwood")
    setSatellite(upwardSatellite ?? "")
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open)
    if (!open) resetSelection()
  }

  async function handleRequest() {
    if (!selectedGroupId) return
    setSubmitting(true)
    const result = await requestGroupChange(token, selectedGroupId)
    setSubmitting(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success("Request submitted — the group leader will confirm it")
    setDialogOpen(false)
    resetSelection()
    router.refresh()
  }

  async function handleSaveSatellite() {
    if (!satellite) return
    setSubmitting(true)
    const result = await setUpwardSatellite(token, satellite)
    setSubmitting(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(`Your DGroup is now recorded at ${satellite}`)
    setDialogOpen(false)
    router.refresh()
  }

  async function handleClearSatellite() {
    setClearing(true)
    const result = await setUpwardSatellite(token, null)
    setClearing(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success("Satellite removed")
    setScope("eastwood")
    setSatellite("")
    router.refresh()
  }

  async function handleCancel() {
    if (!pendingRequest) return
    setCancelling(true)
    const result = await cancelGroupChange(token, pendingRequest.id)
    setCancelling(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success("Request cancelled")
    router.refresh()
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">My group</h2>
        <p className="text-sm text-muted-foreground">
          Your current small-group connection.
        </p>
      </div>

      {myGroup ? (
        <div className="rounded-xl border bg-background p-5 shadow-sm">
          <p className="text-lg font-semibold tracking-tight">{myGroup.name}</p>
          <div className="mt-4 grid gap-3 border-t pt-4 text-sm text-muted-foreground sm:grid-cols-2">
            {myGroup.leader && (
              <p className="flex items-center gap-1.5">
                <IconUsers className="size-3.5" />
                Led by {myGroup.leader.firstName} {myGroup.leader.lastName}
              </p>
            )}
            {schedule && (
              <p className="flex items-center gap-1.5">
                <IconClock className="size-3.5" />
                {schedule}
              </p>
            )}
          </div>
        </div>
      ) : upwardSatellite ? (
        <div className="rounded-xl border bg-background p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-semibold tracking-tight">
                {upwardSatellite}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <IconMapPin className="size-3.5 shrink-0" />
                Your DGroup leader is at another CCF satellite
              </p>
            </div>
            <button
              type="button"
              onClick={handleClearSatellite}
              disabled={clearing}
              className="shrink-0 inline-flex items-center gap-1 rounded-md px-1 py-1 text-xs font-medium text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              <IconX className="size-3.5" />
              {clearing ? "Removing…" : "Remove"}
            </button>
          </div>
          <p className="mt-4 border-t pt-4 text-sm leading-6 text-muted-foreground">
            Because your leader is outside CCF Eastwood, there&apos;s no DGroup here
            to link — we record the satellite instead.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-background px-5 py-6 text-sm leading-6 text-muted-foreground">
          You&apos;re not part of a DGroup yet. You can send a request to join one
          below — or tell us if your leader is from another CCF satellite.
        </div>
      )}

      {pendingRequest ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm leading-5 text-amber-900">
            Your request to {myGroup ? "transfer to" : "join"}{" "}
            <span className="font-medium">{pendingRequest.groupName}</span> is
            pending leader confirmation
          </p>
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            className="shrink-0 inline-flex items-center gap-1 rounded-md px-1 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            <IconX className="size-3.5" />
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
          <IconArrowsExchange className="size-4" />
          {myGroup
            ? "Request to change group"
            : upwardSatellite
              ? "Change my DGroup"
              : "Request to join a group"}
        </Button>
      )}

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {myGroup ? "Change DGroup" : "My DGroup"}
            </DialogTitle>
            <DialogDescription>
              Your DGroup is either here at CCF Eastwood or at another CCF
              satellite.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Where is your DGroup?</Label>
              <Select
                value={scope}
                onValueChange={(v) => setScope(v as UpwardScope)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eastwood">
                    Here at CCF Eastwood
                  </SelectItem>
                  <SelectItem value="satellite">
                    My leader is from another CCF satellite
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scope === "satellite" ? (
              <div className="space-y-2">
                <Label>CCF satellite</Label>
                <PersonCombobox
                  options={SATELLITE_OPTIONS}
                  value={satellite}
                  onValueChange={setSatellite}
                  placeholder="Select a CCF satellite"
                  searchPlaceholder="Search satellites…"
                  emptyText="No satellite found."
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  There&apos;s no request to send — your leader is outside CCF
                  Eastwood, so there&apos;s no DGroup here to link.
                  {myGroup
                    ? ` You'll also be removed from ${myGroup.name}, since that stood in for your DGroup.`
                    : ""}
                </p>
                <Button
                  className="mt-2 w-full"
                  disabled={!satellite || submitting}
                  onClick={handleSaveSatellite}
                >
                  {submitting ? "Saving…" : "Save"}
                </Button>
              </div>
            ) : (
              <>
                <LeaderGroupPicker
                  leaderOptions={leaderOptions}
                  selectedLeaderId={selectedLeaderId}
                  onLeaderChange={setSelectedLeaderId}
                  selectedGroupId={selectedGroupId}
                  onGroupChange={setSelectedGroupId}
                />

                {upwardSatellite && (
                  <p className="text-xs leading-5 text-muted-foreground">
                    {upwardSatellite} stays your DGroup until this leader confirms
                    the request.
                  </p>
                )}

                <Button
                  className="w-full"
                  disabled={!selectedGroupId || submitting}
                  onClick={handleRequest}
                >
                  {submitting ? "Submitting…" : "Submit request"}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

// ─── Led group card ──────────────────────────────────────────────────────────

function LedGroupCard({ token, group }: { token: string; group: LedGroup }) {
  const router = useRouter()
  const [editOpen, setEditOpen] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)
  const [removeTarget, setRemoveTarget] = React.useState<{
    id: string
    name: string
  } | null>(null)
  const [removing, setRemoving] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  const schedule = formatSchedule(
    group.scheduleDayOfWeek,
    group.scheduleTimeStart,
    group.scheduleTimeEnd
  )

  const isCouples = group.groupType === "Couples"
  const members = group.members
  const rosterNameById = new Map(
    members.map((m) => [m.id, `${m.firstName} ${m.lastName}`])
  )
  // Couples groups: order the roster so spouses sit next to each other.
  const orderedMembers = React.useMemo(() => {
    if (!isCouples) return members
    const byId = new Map(members.map((m) => [m.id, m]))
    const seen = new Set<string>()
    const ordered: typeof members = []
    for (const m of members) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      ordered.push(m)
      const partner = m.spouseId ? byId.get(m.spouseId) : undefined
      if (partner && !seen.has(partner.id)) {
        seen.add(partner.id)
        ordered.push(partner)
      }
    }
    return ordered
  }, [members, isCouples])

  async function handleRemove() {
    if (!removeTarget) return
    setRemoving(true)
    const result = await removeMemberFromLedGroup(token, group.id, removeTarget.id)
    setRemoving(false)
    setRemoveTarget(null)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success("Member removed")
    router.refresh()
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteLedGroup(token, group.id)
    setDeleting(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setDeleteOpen(false)
    toast.success("Group deleted")
    router.refresh()
  }

  // Deleting is only offered for a group with nobody in it. The server checks
  // more than this (child groups, pending requests), but an empty roster is the
  // one condition the card can see, and it's the one that matters here.
  const isEmpty = members.length === 0

  return (
    <div className="rounded-xl border bg-background p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-2 font-medium">
            {group.name}
            {group.groupType === "Couples" && <CouplesBadge />}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <IconUsers className="size-3" />
              {group.members.length}
              {group.memberLimit !== null && ` / ${group.memberLimit}`}{" "}
              {group.members.length === 1 && group.memberLimit === null
                ? "member"
                : "members"}
            </span>
            {schedule && (
              <span className="flex items-center gap-1">
                <IconClock className="size-3" />
                {schedule}
              </span>
            )}
            {group.meetingFormat && (
              <span className="flex items-center gap-1">
                <IconDeviceLaptop className="size-3" />
                {MEETING_FORMAT_LABELS[group.meetingFormat]}
              </span>
            )}
            {group.locationCity && (
              <span className="flex items-center gap-1">
                <IconMapPin className="size-3" />
                {group.locationCity}
              </span>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-2 -mt-1 shrink-0 text-muted-foreground"
              aria-label={`More actions for ${group.name}`}
            >
              <IconDotsVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!isEmpty}
              onSelect={() => setDeleteOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              <IconTrash className="size-4" />
              Delete group
            </DropdownMenuItem>
            {!isEmpty && (
              <p className="max-w-52 px-2 py-1.5 text-xs leading-4 text-muted-foreground">
                Only an empty group can be deleted — remove its members first.
              </p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Members */}
      <div className="mt-5 space-y-2 border-t pt-4">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Members
        </p>
        {group.members.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {orderedMembers.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">
                      {m.firstName} {m.lastName}
                    </p>
                    {isCouples &&
                      (m.spouseId ? (
                        <Badge className="shrink-0 gap-1 bg-rose-100 text-rose-800 border-transparent hover:bg-rose-100">
                          <IconHeart className="size-3" />
                          {rosterNameById.get(m.spouseId)?.split(" ")[0] ?? "Couple"}
                        </Badge>
                      ) : (
                        <Badge className="shrink-0 bg-amber-100 text-amber-700 border-transparent">
                          No partner in group
                        </Badge>
                      ))}
                  </div>
                  {m.groupStatus && m.groupStatus !== "Member" && (
                    <p className="text-xs text-muted-foreground">{m.groupStatus}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setRemoveTarget({ id: m.id, name: `${m.firstName} ${m.lastName}` })
                  }
                  className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Remove ${m.firstName} ${m.lastName}`}
                >
                  <IconTrash className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No members yet</p>
        )}
      </div>

      {/* The two things a leader actually does here, given their own row rather
          than crowded against the group's name and the roster heading. */}
      <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <IconPlus className="size-4" />
          Add member
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <IconPencil className="size-4" />
          Edit
        </Button>
      </div>

      <LedGroupFormDialog
        // Remount with fresh field state whenever the saved group data changes.
        key={`${group.name}-${group.groupType}-${group.meetingFormat}-${group.locationCity}-${group.memberLimit}-${group.ageRangeMin}-${group.ageRangeMax}-${group.scheduleDayOfWeek}-${group.scheduleTimeStart}-${group.scheduleTimeEnd}-${group.language.join(",")}`}
        token={token}
        group={group}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AddMemberDialog
        token={token}
        groupId={group.id}
        groupName={group.name}
        isCouples={isCouples}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.name} will be removed from {group.name}. They will
              no longer belong to any DGroup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleRemove()
              }}
              disabled={removing}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {removing ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group?</AlertDialogTitle>
            <AlertDialogDescription>
              {group.name} will be deleted, along with its history. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Led group form dialog (create + edit) ───────────────────────────────────

function LedGroupFormDialog({
  token,
  group,
  open,
  onOpenChange,
}: {
  token: string
  /** Omitted when creating a new group. */
  group?: LedGroup
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const isEdit = !!group
  const [name, setName] = React.useState(group?.name ?? "")
  const [groupType, setGroupType] = React.useState(group?.groupType ?? "Regular")
  const [meetingFormat, setMeetingFormat] = React.useState(group?.meetingFormat ?? "")
  const [locationCity, setLocationCity] = React.useState(group?.locationCity ?? "")
  const [memberLimit, setMemberLimit] = React.useState(
    group?.memberLimit != null ? String(group.memberLimit) : ""
  )
  const [language, setLanguage] = React.useState<string[]>(group?.language ?? [])
  const [ageMin, setAgeMin] = React.useState(
    group?.ageRangeMin != null ? String(group.ageRangeMin) : ""
  )
  const [ageMax, setAgeMax] = React.useState(
    group?.ageRangeMax != null ? String(group.ageRangeMax) : ""
  )
  const [day, setDay] = React.useState(
    group?.scheduleDayOfWeek == null ? "" : String(group.scheduleDayOfWeek)
  )
  const [timeStart, setTimeStart] = React.useState(group?.scheduleTimeStart ?? "")
  const [timeEnd, setTimeEnd] = React.useState(group?.scheduleTimeEnd ?? "")
  const [saving, setSaving] = React.useState(false)

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Group name is required")
      return
    }
    if (!meetingFormat) {
      toast.error("Please select a meeting format")
      return
    }
    if (!day) {
      toast.error("Please set the meeting day")
      return
    }
    if (timeStart && timeEnd && timeStart >= timeEnd) {
      toast.error("End time must be after start time")
      return
    }
    const payload = {
      name,
      groupType,
      meetingFormat,
      locationCity,
      language,
      ageRangeMin: ageMin,
      ageRangeMax: ageMax,
      memberLimit,
      scheduleDayOfWeek: parseInt(day, 10),
      scheduleTimeStart: timeStart,
      scheduleTimeEnd: timeEnd,
    }
    setSaving(true)
    const result = isEdit
      ? await updateLedGroupDetails(token, group.id, payload)
      : await createLedGroup(token, payload)
    setSaving(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success(isEdit ? "Group updated" : "Group created")
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit group" : "Create a group"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update your group's details."
              : "Set up a new DGroup you'll lead. An admin can refine matching settings later."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="led-name">
              Group name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="led-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Victory Group Alpha"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="led-type">
              Group type <span className="text-destructive">*</span>
            </Label>
            <Select value={groupType} onValueChange={setGroupType}>
              <SelectTrigger id="led-type" className="w-full">
                <SelectValue placeholder="Select group type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Regular">Regular</SelectItem>
                <SelectItem value="Couples">Couples</SelectItem>
              </SelectContent>
            </Select>
            {groupType === "Couples" && (
              <p className="text-xs text-muted-foreground">
                Couples groups host married pairs. Members are added together with
                their spouse (from Family records), and gender focus is set to Mixed.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              Meeting schedule <span className="text-destructive">*</span>
            </Label>
            <ScheduleInput
              dayOfWeek={day}
              timeStart={timeStart}
              timeEnd={timeEnd}
              onDayChange={setDay}
              onTimeStartChange={setTimeStart}
              onTimeEndChange={setTimeEnd}
            />
            <p className="text-xs text-muted-foreground">
              Start and end times are optional.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="led-format">
                Meeting format <span className="text-destructive">*</span>
              </Label>
              <Select value={meetingFormat} onValueChange={setMeetingFormat}>
                <SelectTrigger id="led-format" className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Online">Online</SelectItem>
                  <SelectItem value="Hybrid">Hybrid</SelectItem>
                  <SelectItem value="InPerson">In Person</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="led-city">City</Label>
              <Select
                value={locationCity || NO_CITY}
                onValueChange={(v) => setLocationCity(v === NO_CITY ? "" : v)}
              >
                <SelectTrigger id="led-city" className="w-full">
                  <SelectValue placeholder="Select city" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CITY}>No preference</SelectItem>
                  {CITY_OPTIONS.map((city) => (
                    <SelectItem key={city} value={city}>
                      {city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Language</Label>
            <MultiSelect
              className="w-full"
              options={LANGUAGE_OPTIONS}
              value={language}
              onChange={setLanguage}
              placeholder="Any language"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="led-age-min">Min age</Label>
              <Input
                id="led-age-min"
                type="number"
                min={1}
                value={ageMin}
                onChange={(e) => setAgeMin(e.target.value)}
                placeholder="18"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="led-age-max">Max age</Label>
              <Input
                id="led-age-max"
                type="number"
                min={1}
                value={ageMax}
                onChange={(e) => setAgeMax(e.target.value)}
                placeholder="35"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="led-limit">Limit</Label>
              <Input
                id="led-limit"
                type="number"
                min={1}
                value={memberLimit}
                onChange={(e) => setMemberLimit(e.target.value)}
                placeholder="12"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save changes"
                : "Create group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Add member dialog ───────────────────────────────────────────────────────

function AddMemberDialog({
  token,
  groupId,
  groupName,
  isCouples,
  open,
  onOpenChange,
}: {
  token: string
  groupId: string
  groupName: string
  isCouples: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<MemberSearchResult[]>([])
  const [searching, setSearching] = React.useState(false)
  const [addingId, setAddingId] = React.useState<string | null>(null)
  // Couples flow: a chosen member awaiting spouse resolution.
  const [selected, setSelected] = React.useState<MemberSearchResult | null>(null)
  const [spouseInfo, setSpouseInfo] = React.useState<SpouseInfo | null>(null)
  const [spouseLookupDone, setSpouseLookupDone] = React.useState(false)
  const [loadingSpouse, setLoadingSpouse] = React.useState(false)
  const [adding, setAdding] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([])
        return
      }
      setSearching(true)
      const result = await searchMembersToAdd(token, groupId, query)
      setSearching(false)
      if (result.success) setResults(result.data.members)
    }, 300)
    return () => clearTimeout(timer)
  }, [open, query, token, groupId])

  function resetSelection() {
    setSelected(null)
    setSpouseInfo(null)
    setSpouseLookupDone(false)
    setLoadingSpouse(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery("")
      setResults([])
      resetSelection()
    }
    onOpenChange(next)
  }

  async function handleAddIndividual(memberId: string) {
    setAddingId(memberId)
    setAdding(true)
    const result = await addMemberToLedGroup(token, groupId, memberId)
    setAddingId(null)
    setAdding(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success("Member added")
    handleOpenChange(false)
    router.refresh()
  }

  async function handleSelectForCouple(m: MemberSearchResult) {
    setSelected(m)
    setSpouseInfo(null)
    setSpouseLookupDone(false)
    setLoadingSpouse(true)
    const result = await getSpouseForLedGroupMember(token, m.id)
    setLoadingSpouse(false)
    if (result.success) setSpouseInfo(result.data)
    setSpouseLookupDone(true)
  }

  const spouseAlreadyInGroup = spouseInfo?.smallGroupId === groupId
  const canAddCouple = !!spouseInfo && !spouseAlreadyInGroup

  async function handleAddCouple() {
    if (!selected || !spouseInfo) return
    setAdding(true)
    const result = await addCoupleToLedGroup(
      token,
      groupId,
      selected.id,
      spouseInfo.memberId
    )
    setAdding(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success("Couple added")
    handleOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isCouples ? "Add couple to" : "Add member to"} {groupName}
          </DialogTitle>
          <DialogDescription>
            {isCouples
              ? "Search for a member — their spouse (from Family records) is added together with them."
              : "Search existing members by name. Members in another group will be transferred."}
          </DialogDescription>
        </DialogHeader>

        {isCouples && selected ? (
          /* Couples resolution panel */
          <div className="space-y-3">
            <button
              type="button"
              onClick={resetSelection}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              ← Back to search
            </button>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{selected.name}</p>
              {loadingSpouse ? (
                <p className="mt-1 text-muted-foreground">Looking up spouse…</p>
              ) : spouseInfo && spouseAlreadyInGroup ? (
                <p className="mt-1 text-muted-foreground">
                  Spouse{" "}
                  <span className="font-medium">
                    {spouseInfo.firstName} {spouseInfo.lastName}
                  </span>{" "}
                  is already in this group — {selected.name.split(" ")[0]} will be
                  added individually.
                </p>
              ) : spouseInfo ? (
                <p className="mt-1">
                  Will be added together with spouse{" "}
                  <span className="font-medium">
                    {spouseInfo.firstName} {spouseInfo.lastName}
                  </span>
                  {spouseInfo.smallGroupId && spouseInfo.smallGroupId !== groupId && (
                    <span className="text-muted-foreground"> (currently in another group)</span>
                  )}
                  .
                </p>
              ) : spouseLookupDone ? (
                <p className="mt-1 rounded-md bg-amber-50 p-2 text-amber-800">
                  No spouse on record. You can add them individually and link their
                  family under Families later.
                </p>
              ) : null}
            </div>
            <Button
              className="w-full"
              disabled={adding || loadingSpouse}
              onClick={
                canAddCouple ? handleAddCouple : () => handleAddIndividual(selected.id)
              }
            >
              {adding ? "Adding…" : canAddCouple ? "Add couple" : "Add member"}
            </Button>
          </div>
        ) : (
          /* Search */
          <div className="space-y-3">
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search members…"
                className="pl-9"
                autoFocus
              />
            </div>
            {/* Fixed-height region so the dialog doesn't resize between the
                empty, searching, results, and no-results states. */}
            <div className="h-64 overflow-y-auto rounded-lg border">
              {searching ? (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Searching…
                </p>
              ) : results.length > 0 ? (
                <ul className="divide-y">
                  {results.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{m.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {m.currentGroupName
                            ? `Currently in ${m.currentGroupName}`
                            : "Not in a group"}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={addingId !== null}
                        onClick={() =>
                          isCouples ? handleSelectForCouple(m) : handleAddIndividual(m.id)
                        }
                      >
                        {addingId === m.id ? "Adding…" : isCouples ? "Select" : "Add"}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : query.trim().length >= 2 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No members found
                </p>
              ) : (
                <p className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  Type a name to search members.
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
