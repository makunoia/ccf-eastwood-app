"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  IconArrowsExchange,
  IconClock,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUsers,
  IconX,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScheduleInput } from "@/components/ui/schedule-input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  addMemberToLedGroup,
  cancelGroupChange,
  removeMemberFromLedGroup,
  requestGroupChange,
  searchMembersToAdd,
  updateLedGroupSchedule,
  type MemberSearchResult,
} from "./actions"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  const period = h < 12 ? "AM" : "PM"
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, "0")} ${period}`
}

function formatSchedule(day: number | null, start: string | null, end: string | null): string | null {
  if (day === null || !start) return null
  const time = end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start)
  return `${DAY_NAMES[day]} · ${time}`
}

type GroupStatus = "Member" | "Timothy" | "Leader" | null

type LedGroup = {
  id: string
  name: string
  memberLimit: number | null
  scheduleDayOfWeek: number | null
  scheduleTimeStart: string | null
  scheduleTimeEnd: string | null
  members: {
    id: string
    firstName: string
    lastName: string
    groupStatus: GroupStatus
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
  ledGroups: LedGroup[]
  groupOptions: { id: string; name: string; leaderName: string | null }[]
}

export function MePortalClient({
  token,
  member,
  myGroup,
  pendingRequest,
  ledGroups,
  groupOptions,
}: Props) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-4 py-10 space-y-8">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Hi, {member.nickname || member.firstName}!
          </h1>
          <p className="text-sm text-muted-foreground">
            View and manage your small group information
          </p>
        </div>

        <MyGroupSection
          token={token}
          myGroup={myGroup}
          pendingRequest={pendingRequest}
          groupOptions={groupOptions}
        />

        {ledGroups.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Groups You Lead
            </h2>
            <div className="space-y-4">
              {ledGroups.map((g) => (
                <LedGroupCard
                  key={`${g.id}-${g.scheduleDayOfWeek}-${g.scheduleTimeStart}-${g.scheduleTimeEnd}`}
                  token={token}
                  group={g}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// ─── My Group ────────────────────────────────────────────────────────────────

function MyGroupSection({
  token,
  myGroup,
  pendingRequest,
  groupOptions,
}: Pick<Props, "token" | "myGroup" | "pendingRequest" | "groupOptions">) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [selectedGroupId, setSelectedGroupId] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)

  const schedule = myGroup
    ? formatSchedule(myGroup.scheduleDayOfWeek, myGroup.scheduleTimeStart, myGroup.scheduleTimeEnd)
    : null

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
    setSelectedGroupId("")
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
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        My Group
      </h2>

      {myGroup ? (
        <div className="rounded-2xl border bg-card p-4 space-y-2">
          <p className="font-medium">{myGroup.name}</p>
          <div className="space-y-1 text-sm text-muted-foreground">
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
      ) : (
        <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
          You&apos;re not part of any small group yet
        </div>
      )}

      {pendingRequest ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            Your request to {myGroup ? "transfer to" : "join"}{" "}
            <span className="font-medium">{pendingRequest.groupName}</span> is
            pending leader confirmation
          </p>
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:text-amber-950 disabled:opacity-50"
          >
            <IconX className="size-3.5" />
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
          <IconArrowsExchange className="size-4" />
          {myGroup ? "Request to change group" : "Request to join a group"}
        </Button>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {myGroup ? "Change small group" : "Join a small group"}
            </DialogTitle>
            <DialogDescription>
              Your request will be sent to the group leader for confirmation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent>
                {groupOptions.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                    {g.leaderName ? ` — ${g.leaderName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="w-full"
              disabled={!selectedGroupId || submitting}
              onClick={handleRequest}
            >
              {submitting ? "Submitting…" : "Submit request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

// ─── Led group card ──────────────────────────────────────────────────────────

function LedGroupCard({ token, group }: { token: string; group: LedGroup }) {
  const router = useRouter()
  const [day, setDay] = React.useState(
    group.scheduleDayOfWeek === null ? "" : String(group.scheduleDayOfWeek)
  )
  const [timeStart, setTimeStart] = React.useState(group.scheduleTimeStart ?? "")
  const [timeEnd, setTimeEnd] = React.useState(group.scheduleTimeEnd ?? "")
  const [savingSchedule, setSavingSchedule] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)
  const [removeTarget, setRemoveTarget] = React.useState<{
    id: string
    name: string
  } | null>(null)
  const [removing, setRemoving] = React.useState(false)

  const scheduleDirty =
    day !== (group.scheduleDayOfWeek === null ? "" : String(group.scheduleDayOfWeek)) ||
    timeStart !== (group.scheduleTimeStart ?? "") ||
    timeEnd !== (group.scheduleTimeEnd ?? "")

  async function handleSaveSchedule() {
    if (!day || !timeStart || !timeEnd) {
      toast.error("Please set the meeting day, start time, and end time")
      return
    }
    setSavingSchedule(true)
    const result = await updateLedGroupSchedule(token, group.id, {
      dayOfWeek: parseInt(day, 10),
      timeStart,
      timeEnd,
    })
    setSavingSchedule(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success("Schedule updated")
    router.refresh()
  }

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

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">{group.name}</p>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <IconUsers className="size-3" />
          {group.members.length}
          {group.memberLimit !== null && ` / ${group.memberLimit}`}{" "}
          {group.members.length === 1 && group.memberLimit === null
            ? "member"
            : "members"}
        </span>
      </div>

      {/* Schedule */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Meeting Schedule
        </p>
        <ScheduleInput
          dayOfWeek={day}
          timeStart={timeStart}
          timeEnd={timeEnd}
          onDayChange={setDay}
          onTimeStartChange={setTimeStart}
          onTimeEndChange={setTimeEnd}
        />
        {scheduleDirty && (
          <Button size="sm" onClick={handleSaveSchedule} disabled={savingSchedule}>
            {savingSchedule ? "Saving…" : "Save schedule"}
          </Button>
        )}
      </div>

      {/* Members */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Members
          </p>
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <IconPlus className="size-4" />
            Add member
          </Button>
        </div>
        {group.members.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {group.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {m.firstName} {m.lastName}
                  </p>
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

      <AddMemberDialog
        token={token}
        groupId={group.id}
        groupName={group.name}
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
              no longer belong to any small group.
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
    </div>
  )
}

// ─── Add member dialog ───────────────────────────────────────────────────────

function AddMemberDialog({
  token,
  groupId,
  groupName,
  open,
  onOpenChange,
}: {
  token: string
  groupId: string
  groupName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<MemberSearchResult[]>([])
  const [searching, setSearching] = React.useState(false)
  const [addingId, setAddingId] = React.useState<string | null>(null)

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

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery("")
      setResults([])
    }
    onOpenChange(next)
  }

  async function handleAdd(memberId: string) {
    setAddingId(memberId)
    const result = await addMemberToLedGroup(token, groupId, memberId)
    setAddingId(null)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success("Member added")
    handleOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add member to {groupName}</DialogTitle>
          <DialogDescription>
            Search existing members by name. Members in another group will be
            transferred.
          </DialogDescription>
        </DialogHeader>
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
          {searching ? (
            <p className="text-sm text-muted-foreground">Searching…</p>
          ) : results.length > 0 ? (
            <ul className="divide-y rounded-lg border max-h-64 overflow-y-auto">
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
                    onClick={() => handleAdd(m.id)}
                  >
                    {addingId === m.id ? "Adding…" : "Add"}
                  </Button>
                </li>
              ))}
            </ul>
          ) : query.trim().length >= 2 ? (
            <p className="text-sm text-muted-foreground">No members found</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
