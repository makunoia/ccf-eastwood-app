"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  IconArrowLeft,
  IconUserPlus,
  IconUserMinus,
  IconCheck,
  IconX,
  IconClock,
  IconChevronDown,
  IconLink,
  IconCopy,
  IconRefresh,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import {
  defaultSmallGroupForm,
  type SmallGroupFormValues,
} from "@/lib/validations/small-group"
import { LANGUAGE_OPTIONS, CITY_OPTIONS } from "@/lib/constants/group-options"
import {
  createSmallGroup,
  updateSmallGroup,
  deleteSmallGroup,
  addMemberToGroup,
  removeMemberFromGroup,
  updateMemberGroupStatus,
  assignGuestToGroupTemporarily,
  assignMemberTransferTemporarily,
  cancelTempAssignment,
  generateGroupConfirmationToken,
} from "./actions"
import { searchGuests, promoteGuestToMember } from "@/app/(dashboard)/guests/actions"
import { MobileFormActions } from "@/components/mobile-form-actions"
import { type SmallGroupRow } from "./columns"

type GroupMember = {
  id: string
  firstName: string
  lastName: string
  groupStatus: "Member" | "Timothy" | "Leader" | null
}

type GuestSearchResult = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
}

const GROUP_STATUS_COLORS: Record<string, string> = {
  Member:  "bg-slate-100 text-slate-700",
  Timothy: "bg-amber-100 text-amber-700",
  Leader:  "bg-green-100 text-green-700",
}

const GROUP_STATUS_OPTIONS = [
  { value: "Member",  label: "Member" },
  { value: "Timothy", label: "Timothy" },
  { value: "Leader",  label: "Leader" },
]

type PendingRequest = {
  id: string
  type: "guest" | "member"
  name: string
  fromGroupName: string | null
  assignedByName: string | null
  createdAt: Date
}

type GroupLogEntry = {
  id: string
  action: string
  description: string | null
  performedByName: string | null
  createdAt: Date
}

type Props = {
  members: { id: string; firstName: string; lastName: string; smallGroupId: string | null }[]
  smallGroups: { id: string; name: string }[]
  lifeStages: { id: string; name: string }[]
  group?: SmallGroupRow
  groupMembers?: GroupMember[]
  pendingRequests?: PendingRequest[]
  logs?: GroupLogEntry[]
  leaderConfirmationToken?: string | null
}

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

function toFormValues(group: SmallGroupRow): SmallGroupFormValues {
  return {
    name: group.name,
    leaderId: group.leaderId,
    parentGroupId: group.parentGroupId ?? "",
    lifeStageId: group.lifeStageId ?? "",
    genderFocus: group.genderFocus ?? "",
    language: group.language ?? [],
    ageRangeMin: group.ageRangeMin != null ? String(group.ageRangeMin) : "",
    ageRangeMax: group.ageRangeMax != null ? String(group.ageRangeMax) : "",
    meetingFormat: group.meetingFormat ?? "",
    locationCity: group.locationCity ?? "",
    memberLimit: group.memberLimit != null ? String(group.memberLimit) : "",
    scheduleDayOfWeek: group.scheduleDayOfWeek != null ? String(group.scheduleDayOfWeek) : "",
    scheduleTimeStart: group.scheduleTimeStart ?? "",
  }
}

const LOG_ACTION_LABELS: Record<string, string> = {
  GroupCreated: "Group created",
  MemberAdded: "Member added",
  MemberRemoved: "Member removed",
  MemberTransferred: "Member transferred",
  TempAssignmentCreated: "Temp assignment created",
  TempAssignmentConfirmed: "Assignment confirmed",
  TempAssignmentRejected: "Assignment rejected/cancelled",
}

function formatRelativeTime(date: Date): string {
  const now = Date.now()
  const diff = now - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 30) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

export function SmallGroupForm({
  members,
  smallGroups,
  lifeStages,
  group,
  groupMembers,
  pendingRequests = [],
  logs = [],
  leaderConfirmationToken,
}: Props) {
  const router = useRouter()
  const isEdit = !!group
  const [form, setForm] = React.useState<SmallGroupFormValues>(
    () => group ? toFormValues(group) : defaultSmallGroupForm
  )
  const [saving, setSaving] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [addMemberOpen, setAddMemberOpen] = React.useState(false)
  const [selectedMemberId, setSelectedMemberId] = React.useState("")
  const [addingMember, setAddingMember] = React.useState(false)
  const [removingMemberId, setRemovingMemberId] = React.useState<string | null>(null)
  const [removeConfirmMember, setRemoveConfirmMember] = React.useState<GroupMember | null>(null)
  const [addGuestOpen, setAddGuestOpen] = React.useState(false)
  const [guestQuery, setGuestQuery] = React.useState("")
  const [guestResults, setGuestResults] = React.useState<GuestSearchResult[]>([])
  const [selectedGuest, setSelectedGuest] = React.useState<GuestSearchResult | null>(null)
  const [searchingGuests, setSearchingGuests] = React.useState(false)
  const [addingGuest, setAddingGuest] = React.useState(false)

  // Temporary assignment state
  const [tempGuestOpen, setTempGuestOpen] = React.useState(false)
  const [tempGuestQuery, setTempGuestQuery] = React.useState("")
  const [tempGuestResults, setTempGuestResults] = React.useState<GuestSearchResult[]>([])
  const [tempSelectedGuest, setTempSelectedGuest] = React.useState<GuestSearchResult | null>(null)
  const [searchingTempGuests, setSearchingTempGuests] = React.useState(false)
  const [assigningTempGuest, setAssigningTempGuest] = React.useState(false)

  const [tempMemberOpen, setTempMemberOpen] = React.useState(false)
  const [tempSelectedMemberId, setTempSelectedMemberId] = React.useState("")
  const [assigningTempMember, setAssigningTempMember] = React.useState(false)

  const [cancellingRequestId, setCancellingRequestId] = React.useState<string | null>(null)

  const [token, setToken] = React.useState<string | null | undefined>(leaderConfirmationToken)
  const [generatingToken, setGeneratingToken] = React.useState(false)
  const confirmationUrl =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/small-group-confirmation/${token}`
      : token
        ? `/small-group-confirmation/${token}`
        : null

  function set(field: keyof SmallGroupFormValues, value: string | string[]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleRevert() {
    setForm(group ? toFormValues(group) : defaultSmallGroupForm)
  }

  // For edit mode, exclude self from parent group options to prevent trivial cycles
  const parentGroupOptions = smallGroups.filter((g) => g.id !== group?.id)

  // Members not already in this group, available to add
  const currentMemberIds = new Set(groupMembers?.map((m) => m.id) ?? [])
  const availableMembers = members.filter((m) => !currentMemberIds.has(m.id))

  const memberLimitNum =
    form.memberLimit !== "" ? parseInt(form.memberLimit, 10) : null
  const currentMemberCount = groupMembers?.length ?? 0
  const isAtCapacity =
    memberLimitNum !== null &&
    !isNaN(memberLimitNum) &&
    memberLimitNum > 0 &&
    currentMemberCount >= memberLimitNum


  async function handleAddMember() {
    if (!selectedMemberId || !group) return
    setAddingMember(true)
    const result = await addMemberToGroup(group.id, selectedMemberId)
    setAddingMember(false)
    if (result.success) {
      toast.success("Member added to group")
      setAddMemberOpen(false)
      setSelectedMemberId("")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleGuestSearch(q: string) {
    setGuestQuery(q)
    setSelectedGuest(null)
    if (q.trim().length < 2) { setGuestResults([]); return }
    setSearchingGuests(true)
    const result = await searchGuests(q)
    setSearchingGuests(false)
    if (result.success) setGuestResults(result.data)
  }

  function resetGuestDialog() {
    setGuestQuery("")
    setGuestResults([])
    setSelectedGuest(null)
    setAddingGuest(false)
  }

  async function handleAddGuest() {
    if (!selectedGuest || !group) return
    setAddingGuest(true)
    const result = await promoteGuestToMember(selectedGuest.id, group.id)
    setAddingGuest(false)
    if (result.success) {
      toast.success(`${selectedGuest.firstName} ${selectedGuest.lastName} promoted and added to group`)
      setAddGuestOpen(false)
      resetGuestDialog()
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleStatusChange(memberId: string, status: "Member" | "Timothy" | "Leader") {
    if (!group) return
    const result = await updateMemberGroupStatus(memberId, group.id, status)
    if (result.success) {
      toast.success("Status updated")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!group) return
    setRemovingMemberId(memberId)
    const result = await removeMemberFromGroup(memberId, group.id)
    setRemovingMemberId(null)
    setRemoveConfirmMember(null)
    if (result.success) {
      toast.success("Member removed from group")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleTempGuestSearch(q: string) {
    setTempGuestQuery(q)
    setTempSelectedGuest(null)
    if (q.trim().length < 2) { setTempGuestResults([]); return }
    setSearchingTempGuests(true)
    const result = await searchGuests(q)
    setSearchingTempGuests(false)
    if (result.success) setTempGuestResults(result.data)
  }

  function resetTempGuestDialog() {
    setTempGuestQuery("")
    setTempGuestResults([])
    setTempSelectedGuest(null)
    setAssigningTempGuest(false)
  }

  async function handleAssignTempGuest() {
    if (!tempSelectedGuest || !group) return
    setAssigningTempGuest(true)
    const result = await assignGuestToGroupTemporarily(group.id, tempSelectedGuest.id)
    setAssigningTempGuest(false)
    if (result.success) {
      toast.success(`${tempSelectedGuest.firstName} ${tempSelectedGuest.lastName} temporarily assigned — pending leader confirmation`)
      setTempGuestOpen(false)
      resetTempGuestDialog()
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleAssignTempMember() {
    if (!tempSelectedMemberId || !group) return
    setAssigningTempMember(true)
    const result = await assignMemberTransferTemporarily(group.id, tempSelectedMemberId)
    setAssigningTempMember(false)
    if (result.success) {
      toast.success("Transfer request created — pending leader confirmation")
      setTempMemberOpen(false)
      setTempSelectedMemberId("")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleCancelRequest(requestId: string) {
    setCancellingRequestId(requestId)
    const result = await cancelTempAssignment(requestId)
    setCancellingRequestId(null)
    if (result.success) {
      toast.success("Assignment cancelled")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  async function handleCopyLeaderLink() {
    if (!confirmationUrl) return
    await navigator.clipboard.writeText(confirmationUrl)
    toast.success("Leader link copied to clipboard")
  }

  async function handleGenerateToken() {
    if (!group) return
    setGeneratingToken(true)
    const result = await generateGroupConfirmationToken(group.id)
    setGeneratingToken(false)
    if (result.success) {
      const newToken = result.data.url.split("/").pop()!
      setToken(newToken)
      toast.success("Leader link generated")
    } else {
      toast.error(result.error)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const result = isEdit
      ? await updateSmallGroup(group!.id, form)
      : await createSmallGroup(form)

    setSaving(false)

    if (result.success) {
      toast.success(isEdit ? "Small group updated" : "Small group created")
      router.push("/small-groups")
    } else {
      toast.error(result.error)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteSmallGroup(group!.id)
    setDeleting(false)
    if (result.success) {
      toast.success("Small group deleted")
      router.push("/small-groups")
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 pb-24 sm:pb-6">
      <div>
        <Link
          href="/small-groups"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Small Groups
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">
            {isEdit ? group!.name : "New Small Group"}
          </h2>
          {!isEdit && (
            <p className="text-sm text-muted-foreground">
              Fill in the details to create a new small group.
            </p>
          )}
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {isEdit && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              disabled={saving}
            >
              Delete
            </Button>
          )}
          <Button type="submit" form="small-group-form" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create group"}
          </Button>
        </div>
      </div>

      {isEdit ? (
        <Tabs defaultValue="details" className="max-w-2xl">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="members">
              Members{(groupMembers?.length ?? 0) + pendingRequests.length > 0 ? ` (${(groupMembers?.length ?? 0) + pendingRequests.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="logs">
              Logs{logs.length > 0 ? ` (${logs.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4">
            <form
              id="small-group-form"
              onSubmit={handleSubmit}
              className="space-y-8"
            >
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="lifeStageId">
                      Life Stage <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={form.lifeStageId}
                      onValueChange={(v) => set("lifeStageId", v)}
                    >
                      <SelectTrigger id="lifeStageId">
                        <SelectValue placeholder="Select life stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {lifeStages.map((ls) => (
                          <SelectItem key={ls.id} value={ls.id}>
                            {ls.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="genderFocus">
                      Gender Focus <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={form.genderFocus}
                      onValueChange={(v) => set("genderFocus", v)}
                    >
                      <SelectTrigger id="genderFocus">
                        <SelectValue placeholder="Select gender focus" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Mixed">Mixed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meetingFormat">
                    Meeting Format <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.meetingFormat}
                    onValueChange={(v) => set("meetingFormat", v)}
                  >
                    <SelectTrigger id="meetingFormat">
                      <SelectValue placeholder="Select meeting format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Online">Online</SelectItem>
                      <SelectItem value="Hybrid">Hybrid</SelectItem>
                      <SelectItem value="InPerson">In Person</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>
                    Meeting Schedule <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={form.scheduleDayOfWeek}
                      onValueChange={(v) => set("scheduleDayOfWeek", v)}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue placeholder="Day" />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS_OF_WEEK.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="time"
                      value={form.scheduleTimeStart}
                      onChange={(e) => set("scheduleTimeStart", e.target.value)}
                      className="w-32"
                      required
                    />
                  </div>
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

                <div className="space-y-2">
                  <Label>Language</Label>
                  <MultiSelect
                    options={LANGUAGE_OPTIONS}
                    value={form.language}
                    onChange={(v) => set("language", v)}
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
                    <Label htmlFor="locationCity">City</Label>
                    <Select
                      value={form.locationCity}
                      onValueChange={(v) => set("locationCity", v === "_none" ? "" : v)}
                    >
                      <SelectTrigger id="locationCity">
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
                </div>
              </section>
            </form>
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="rounded-md border divide-y">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="mt-0.5 shrink-0">
                      {(log.action === "MemberAdded" || log.action === "TempAssignmentConfirmed" || log.action === "GroupCreated") ? (
                        <span className="inline-flex size-5 items-center justify-center rounded-full bg-green-100">
                          <IconCheck className="size-3 text-green-700" />
                        </span>
                      ) : log.action === "MemberRemoved" || log.action === "TempAssignmentRejected" ? (
                        <span className="inline-flex size-5 items-center justify-center rounded-full bg-red-100">
                          <IconX className="size-3 text-red-700" />
                        </span>
                      ) : (
                        <span className="inline-flex size-5 items-center justify-center rounded-full bg-blue-100">
                          <IconClock className="size-3 text-blue-700" />
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{log.description ?? LOG_ACTION_LABELS[log.action] ?? log.action}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {log.performedByName ? `${log.performedByName} · ` : ""}
                        {formatRelativeTime(log.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="members" className="mt-4 space-y-6">
            {/* Members */}
            {groupMembers && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Members (
                    {memberLimitNum !== null && !isNaN(memberLimitNum)
                      ? `${currentMemberCount} / ${memberLimitNum}`
                      : currentMemberCount}
                    )
                  </h3>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isAtCapacity}
                        title={isAtCapacity ? `Group is at its member limit of ${memberLimitNum}` : undefined}
                      >
                        <IconUserPlus className="size-4" />
                        Add
                        <IconChevronDown className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setAddGuestOpen(true)}>
                        Guest
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setAddMemberOpen(true)}>
                        Member
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {isAtCapacity && (
                  <p className="text-xs text-muted-foreground">
                    This group has reached its member limit. Increase the limit or remove a member to add more.
                  </p>
                )}
                {groupMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No members in this group yet.</p>
                ) : (
                  <div className="rounded-md border divide-y">
                    {groupMembers.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                        <Link
                          href={`/members/${m.id}`}
                          className="flex-1 min-w-0 hover:underline"
                        >
                          <span className="text-sm font-medium">
                            {m.firstName} {m.lastName}
                          </span>
                        </Link>
                        <Select
                          value={m.groupStatus ?? ""}
                          onValueChange={(v) => handleStatusChange(m.id, v as "Member" | "Timothy" | "Leader")}
                        >
                          <SelectTrigger className={`w-28 h-7 text-xs font-medium border-0 ${m.groupStatus ? GROUP_STATUS_COLORS[m.groupStatus] : "bg-slate-100 text-slate-700"}`}>
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {GROUP_STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s.value} value={s.value} className="text-xs">
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setRemoveConfirmMember(m)}
                          disabled={removingMemberId === m.id}
                        >
                          <IconUserMinus className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Temporary Members */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Temporary Members
                  </h3>
                  {pendingRequests.length > 0 && (
                    <span className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5">
                      {pendingRequests.length}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTempGuestOpen(true)}
                  >
                    <IconUserPlus className="size-4" />
                    Assign guest
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTempMemberOpen(true)}
                  >
                    <IconUserPlus className="size-4" />
                    Transfer
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Temporarily assigned people appear here until the group leader confirms or declines via the leader link.
              </p>
              {pendingRequests.length > 0 && (
              <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <IconLink className="size-3.5" />
                  Leader confirmation link
                </p>
                {confirmationUrl ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-muted px-3 py-2 text-xs">
                      {confirmationUrl}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyLeaderLink}
                    >
                      <IconCopy className="size-4" />
                      Copy
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateToken}
                      disabled={generatingToken}
                      title="Regenerate link"
                    >
                      <IconRefresh className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateToken}
                    disabled={generatingToken}
                  >
                    <IconLink className="size-4" />
                    {generatingToken ? "Generating…" : "Generate link"}
                  </Button>
                )}
              </div>
              )}
              {pendingRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending assignments.</p>
              ) : (
                <div className="rounded-md border divide-y">
                  {pendingRequests.map((req) => (
                    <div key={req.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{req.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {req.type === "guest"
                            ? "New guest"
                            : req.fromGroupName
                              ? `Transfer from ${req.fromGroupName}`
                              : "Transfer from another group"}
                          {req.assignedByName && ` · Assigned by ${req.assignedByName}`}
                          {" · "}
                          {formatRelativeTime(req.createdAt)}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                        Pending
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive shrink-0"
                        onClick={() => handleCancelRequest(req.id)}
                        disabled={cancellingRequestId === req.id}
                        title="Cancel assignment"
                      >
                        <IconX className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </TabsContent>
        </Tabs>
      ) : (
        <form
          id="small-group-form"
          onSubmit={handleSubmit}
          className="max-w-2xl space-y-8"
        >
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lifeStageId">
                  Life Stage <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.lifeStageId}
                  onValueChange={(v) => set("lifeStageId", v)}
                >
                  <SelectTrigger id="lifeStageId">
                    <SelectValue placeholder="Select life stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {lifeStages.map((ls) => (
                      <SelectItem key={ls.id} value={ls.id}>
                        {ls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="genderFocus">
                  Gender Focus <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.genderFocus}
                  onValueChange={(v) => set("genderFocus", v)}
                >
                  <SelectTrigger id="genderFocus">
                    <SelectValue placeholder="Select gender focus" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="meetingFormat">
                Meeting Format <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.meetingFormat}
                onValueChange={(v) => set("meetingFormat", v)}
              >
                <SelectTrigger id="meetingFormat">
                  <SelectValue placeholder="Select meeting format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Online">Online</SelectItem>
                  <SelectItem value="Hybrid">Hybrid</SelectItem>
                  <SelectItem value="InPerson">In Person</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                Meeting Schedule <span className="text-destructive">*</span>
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={form.scheduleDayOfWeek}
                  onValueChange={(v) => set("scheduleDayOfWeek", v)}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Day" />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="time"
                  value={form.scheduleTimeStart}
                  onChange={(e) => set("scheduleTimeStart", e.target.value)}
                  className="w-32"
                  required
                />
              </div>
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

            <div className="space-y-2">
              <Label>Language</Label>
              <MultiSelect
                options={LANGUAGE_OPTIONS}
                value={form.language}
                onChange={(v) => set("language", v)}
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
                <Label htmlFor="locationCity">City</Label>
                <Select
                  value={form.locationCity}
                  onValueChange={(v) => set("locationCity", v === "_none" ? "" : v)}
                >
                  <SelectTrigger id="locationCity">
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
            </div>
          </section>
        </form>
      )}

      {/* Add member dialog */}
      <Dialog open={addMemberOpen} onOpenChange={(open) => { setAddMemberOpen(open); if (!open) setSelectedMemberId("") }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>
              Select a member to add to <span className="font-medium">{group?.name}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="add-member-select">Member</Label>
            {availableMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">All members are already in this group.</p>
            ) : (
              <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                <SelectTrigger id="add-member-select">
                  <SelectValue placeholder="Select a member" />
                </SelectTrigger>
                <SelectContent>
                  {availableMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.firstName} {m.lastName}
                      {m.smallGroupId && m.smallGroupId !== group?.id && (
                        <span className="ml-2 text-muted-foreground text-xs">(in another group)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberOpen(false)} disabled={addingMember}>
              Cancel
            </Button>
            <Button onClick={handleAddMember} disabled={!selectedMemberId || addingMember || availableMembers.length === 0}>
              {addingMember ? "Adding…" : "Add member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add guest dialog */}
      <Dialog open={addGuestOpen} onOpenChange={(open) => { setAddGuestOpen(open); if (!open) resetGuestDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add guest</DialogTitle>
            <DialogDescription>
              Search for a guest to promote and add to{" "}
              <span className="font-medium">{group?.name}</span>. This will create a Member record from the guest&apos;s profile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Search guests</Label>
              <Input
                placeholder="Name, phone, or email…"
                value={guestQuery}
                onChange={(e) => handleGuestSearch(e.target.value)}
                autoFocus
              />
            </div>
            {searchingGuests && (
              <p className="text-sm text-muted-foreground">Searching…</p>
            )}
            {!searchingGuests && guestQuery.trim().length >= 2 && guestResults.length === 0 && (
              <p className="text-sm text-muted-foreground">No guests found.</p>
            )}
            {guestResults.length > 0 && (
              <div className="rounded-md border divide-y max-h-52 overflow-y-auto">
                {guestResults.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGuest(g)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-muted transition-colors ${
                      selectedGuest?.id === g.id ? "bg-muted" : ""
                    }`}
                  >
                    <div className="text-sm font-medium">
                      {g.firstName} {g.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[g.phone, g.email].filter(Boolean).join(" · ")}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddGuestOpen(false)} disabled={addingGuest}>
              Cancel
            </Button>
            <Button onClick={handleAddGuest} disabled={!selectedGuest || addingGuest}>
              {addingGuest ? "Promoting…" : "Promote & add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove member confirmation dialog */}
      <Dialog open={!!removeConfirmMember} onOpenChange={(open) => { if (!open) setRemoveConfirmMember(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              Remove <span className="font-medium">{removeConfirmMember?.firstName} {removeConfirmMember?.lastName}</span> from <span className="font-medium">{group?.name}</span>? They will no longer belong to this group.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveConfirmMember(null)} disabled={!!removingMemberId}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeConfirmMember && handleRemoveMember(removeConfirmMember.id)}
              disabled={!!removingMemberId}
            >
              {removingMemberId ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign guest temporarily dialog */}
      <Dialog
        open={tempGuestOpen}
        onOpenChange={(open) => { setTempGuestOpen(open); if (!open) resetTempGuestDialog() }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign guest temporarily</DialogTitle>
            <DialogDescription>
              Search for a guest to temporarily assign to{" "}
              <span className="font-medium">{group?.name}</span>. The group leader must confirm before they become a full member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Search guests</Label>
              <Input
                placeholder="Name, phone, or email…"
                value={tempGuestQuery}
                onChange={(e) => handleTempGuestSearch(e.target.value)}
                autoFocus
              />
            </div>
            {searchingTempGuests && (
              <p className="text-sm text-muted-foreground">Searching…</p>
            )}
            {!searchingTempGuests && tempGuestQuery.trim().length >= 2 && tempGuestResults.length === 0 && (
              <p className="text-sm text-muted-foreground">No guests found.</p>
            )}
            {tempGuestResults.length > 0 && (
              <div className="rounded-md border divide-y max-h-52 overflow-y-auto">
                {tempGuestResults.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setTempSelectedGuest(g)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-muted transition-colors ${
                      tempSelectedGuest?.id === g.id ? "bg-muted" : ""
                    }`}
                  >
                    <div className="text-sm font-medium">
                      {g.firstName} {g.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[g.phone, g.email].filter(Boolean).join(" · ")}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTempGuestOpen(false)} disabled={assigningTempGuest}>
              Cancel
            </Button>
            <Button onClick={handleAssignTempGuest} disabled={!tempSelectedGuest || assigningTempGuest}>
              {assigningTempGuest ? "Assigning…" : "Assign temporarily"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign member transfer temporarily dialog */}
      <Dialog
        open={tempMemberOpen}
        onOpenChange={(open) => { setTempMemberOpen(open); if (!open) setTempSelectedMemberId("") }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign member transfer</DialogTitle>
            <DialogDescription>
              Select a member to temporarily assign for transfer to{" "}
              <span className="font-medium">{group?.name}</span>. The group leader must confirm before they are moved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="temp-member-select">Member</Label>
            <Select value={tempSelectedMemberId} onValueChange={setTempSelectedMemberId}>
              <SelectTrigger id="temp-member-select">
                <SelectValue placeholder="Select a member" />
              </SelectTrigger>
              <SelectContent>
                {members
                  .filter((m) => !currentMemberIds.has(m.id))
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.firstName} {m.lastName}
                      {m.smallGroupId && (
                        <span className="ml-2 text-muted-foreground text-xs">(in a group)</span>
                      )}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTempMemberOpen(false)} disabled={assigningTempMember}>
              Cancel
            </Button>
            <Button onClick={handleAssignTempMember} disabled={!tempSelectedMemberId || assigningTempMember}>
              {assigningTempMember ? "Assigning…" : "Assign transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MobileFormActions
        formId="small-group-form"
        isEdit={isEdit}
        saving={saving}
        saveLabel={isEdit ? "Save changes" : "Create group"}
        onRevert={handleRevert}
        onDelete={isEdit ? () => setDeleteOpen(true) : undefined}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete small group</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">{group?.name}</span>? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
