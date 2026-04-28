"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconSparkles, IconLoader, IconX } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { SmallGroupMatchCard } from "@/components/small-group-match-card"
import { SmallGroupDetailSheet } from "@/components/small-group-detail-sheet"
import { findSmallGroupMatchesWithEscalation } from "../matching-actions"
import { clearGuestClaimedGroup, saveGuestMatchingProfile } from "../actions"
import { assignGuestToGroupTemporarily } from "../../small-groups/actions"
import type { MatchResult, EscalationLevel } from "@/lib/matching/types"
import type { GuestPipelineStatus } from "@/lib/guest-utils"

// ─── Schedule helpers ────────────────────────────────────────────────────────

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

function buildScheduleSlot(prefs: MatchingPrefs): { dayOfWeek: number; timeStart: string; timeEnd: string } | null {
  if (!prefs.scheduleDayOfWeek || !prefs.scheduleTimeStart || !prefs.scheduleTimeEnd) {
    return null
  }
  if (prefs.scheduleTimeStart >= prefs.scheduleTimeEnd) {
    return null
  }
  return {
    dayOfWeek: Number(prefs.scheduleDayOfWeek),
    timeStart: prefs.scheduleTimeStart,
    timeEnd: prefs.scheduleTimeEnd,
  }
}

// ─── Pipeline stepper ────────────────────────────────────────────────────────

// "Declined" replaces "Matched" in the stepper when the guest has been rejected
const PIPELINE_STAGES_DEFAULT: GuestPipelineStatus[] = ["New", "EventAttendee", "Matched", "Pending", "Member"]
const PIPELINE_STAGES_DECLINED: GuestPipelineStatus[] = ["New", "EventAttendee", "Declined", "Pending", "Member"]

const STAGE_LABEL: Record<GuestPipelineStatus, string> = {
  New: "New",
  EventAttendee: "Event Attendee",
  Matched: "Matched",
  Declined: "Declined",
  Pending: "Pending",
  Member: "Member",
}
const STAGE_DESCRIPTION: Record<GuestPipelineStatus, string> = {
  New: "Registered but has not yet attended an event.",
  EventAttendee: "Has attended at least one event but hasn't been placed in a breakout group yet.",
  Matched: "Was placed in a breakout group at an event and is ready to be connected to a small group.",
  Declined: "Was placed in a breakout group but membership was declined by the group leader. Assign to another small group.",
  Pending: "Has a pending small group assignment — awaiting confirmation from the group leader.",
  Member: "Has joined a small group and been promoted to a full member.",
}

function PipelineStepper({ status }: { status: GuestPipelineStatus }) {
  const isDeclined = status === "Declined"
  const stages = isDeclined ? PIPELINE_STAGES_DECLINED : PIPELINE_STAGES_DEFAULT
  const activeIndex = stages.indexOf(status)
  const CHEVRON = 18

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex">
        {stages.map((stage, i) => {
          const isActive = i === activeIndex
          const isPast = i < activeIndex
          const isFirst = i === 0
          const isLast = i === stages.length - 1

          const clipPath = isFirst
            ? `polygon(0 0, calc(100% - ${CHEVRON}px) 0, 100% 50%, calc(100% - ${CHEVRON}px) 100%, 0 100%)`
            : isLast
            ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${CHEVRON}px 50%)`
            : `polygon(0 0, calc(100% - ${CHEVRON}px) 0, 100% 50%, calc(100% - ${CHEVRON}px) 100%, 0 100%, ${CHEVRON}px 50%)`

          return (
            <div
              key={stage}
              className={[
                "relative flex flex-1 items-center select-none text-xs",
                isActive && isDeclined
                  ? "bg-destructive text-destructive-foreground"
                  : isActive
                  ? "bg-foreground text-background"
                  : isPast
                  ? "bg-muted text-foreground/50"
                  : "bg-muted/40 text-muted-foreground/60",
              ].join(" ")}
              style={{
                clipPath,
                marginLeft: i > 0 ? `-${CHEVRON}px` : undefined,
                zIndex: stages.length - i,
                paddingTop: 10,
                paddingBottom: 10,
                paddingLeft: isFirst ? 16 : CHEVRON + 10,
                paddingRight: isLast ? 16 : CHEVRON + 10,
              }}
            >
              <span className={isActive ? "font-semibold" : "font-medium"}>
                {STAGE_LABEL[stage]}
              </span>
            </div>
          )
        })}
      </div>
      <div className="border-t bg-muted/30 px-4 py-2.5">
        <p className="text-xs text-muted-foreground">{STAGE_DESCRIPTION[status]}</p>
      </div>
    </div>
  )
}

// ─── Level labels ─────────────────────────────────────────────────────────────

const LEVEL_LABEL: Record<1 | 2 | 3, string> = {
  1: "Breakout facilitator's group",
  2: "Other event volunteer groups",
  3: "All small groups",
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ClaimedGroup = {
  id: string
  name: string
  leader: { id: string; firstName: string; lastName: string } | null
} | null

type MatchedBreakout = {
  eventName: string
  breakoutGroupName: string
  facilitatorName: string | null
  linkedSmallGroup: {
    name: string
    leader: { firstName: string; lastName: string } | null
  } | null
} | null

type MatchingPrefs = {
  lifeStageId: string
  gender: string
  language: string[]
  workCity: string
  workIndustry: string
  meetingPreference: string
  scheduleDayOfWeek: string
  scheduleTimeStart: string
  scheduleTimeEnd: string
}

export type GuestMatchSectionHandle = {
  save: () => Promise<boolean>
}

// ─── Main section ─────────────────────────────────────────────────────────────

export const GuestMatchSection = React.forwardRef<
  GuestMatchSectionHandle,
  {
    guestId: string
    pipelineStatus: GuestPipelineStatus
    claimedGroup: ClaimedGroup
    pendingGroupName: string | null
    pendingGroupId: string | null
    matchedBreakout: MatchedBreakout
    initialPrefs: MatchingPrefs
    lifeStages: { id: string; name: string }[]
  }
>(function GuestMatchSection(
  {
    guestId,
    pipelineStatus,
    claimedGroup,
    pendingGroupName,
    pendingGroupId,
    matchedBreakout,
    initialPrefs,
    lifeStages,
  },
  ref
) {
  const router = useRouter()
  const [state, setState] = React.useState<"idle" | "loading" | "done">("idle")
  const [dirty, setDirty] = React.useState(false)
  const [levels, setLevels] = React.useState<EscalationLevel[]>([])
  const [assigningId, setAssigningId] = React.useState<string | null>(null)
  const [clearingClaimed, setClearingClaimed] = React.useState(false)
  const [localClaimedGroup, setLocalClaimedGroup] = React.useState<ClaimedGroup>(claimedGroup)
  const [selectedGroupId, setSelectedGroupId] = React.useState<string | null>(null)

  const prefsRef = React.useRef(initialPrefs)

  React.useImperativeHandle(ref, () => ({
    async save(): Promise<boolean> {
      const res = await saveGuestMatchingProfile(guestId, {
        lifeStageId: prefsRef.current.lifeStageId || null,
        gender: (prefsRef.current.gender as "Male" | "Female") || null,
        language: prefsRef.current.language,
        workCity: prefsRef.current.workCity || null,
        workIndustry: prefsRef.current.workIndustry || null,
        meetingPreference: (prefsRef.current.meetingPreference as "Online" | "Hybrid" | "InPerson") || null,
        scheduleDayOfWeek: prefsRef.current.scheduleDayOfWeek ? Number(prefsRef.current.scheduleDayOfWeek) : null,
        scheduleTimeStart: prefsRef.current.scheduleTimeStart || null,
      })
      if (res.success) {
        setDirty(false)
        toast.success("Matching profile saved")
        return true
      } else {
        toast.error(res.error)
        return false
      }
    },
  }))
  const [sheetOpen, setSheetOpen] = React.useState(false)

  const [prefs, setPrefs] = React.useState<MatchingPrefs>(initialPrefs)
  function setPref<K extends keyof MatchingPrefs>(key: K, value: MatchingPrefs[K]) {
    setDirty(true)
    setPrefs((prev) => {
      const next = { ...prev, [key]: value }
      prefsRef.current = next
      return next
    })
  }

  async function handleSearch() {
    if (!prefs.lifeStageId) { toast.error("Life Stage is required"); return }
    if (prefs.language.length === 0) { toast.error("Language is required"); return }
    if (!prefs.meetingPreference) { toast.error("Meeting Preference is required"); return }
    if (!prefs.scheduleDayOfWeek) { toast.error("Schedule day is required"); return }
    if (!prefs.scheduleTimeStart || !prefs.scheduleTimeEnd) {
      toast.error("Schedule time range is required")
      return
    }
    if (prefs.scheduleTimeStart >= prefs.scheduleTimeEnd) {
      toast.error("Schedule end time must be after start time")
      return
    }

    setState("loading")

    const saveRes = await saveGuestMatchingProfile(guestId, {
      lifeStageId: prefs.lifeStageId || null,
      gender: (prefs.gender as "Male" | "Female") || null,
      language: prefs.language,
      workCity: prefs.workCity || null,
      workIndustry: prefs.workIndustry || null,
      meetingPreference: (prefs.meetingPreference as "Online" | "Hybrid" | "InPerson") || null,
      scheduleDayOfWeek: prefs.scheduleDayOfWeek ? Number(prefs.scheduleDayOfWeek) : null,
      scheduleTimeStart: prefs.scheduleTimeStart || null,
    })
    if (!saveRes.success) {
      setState("idle")
      toast.error(saveRes.error)
      return
    }

    const scheduleSlot = buildScheduleSlot(prefs)
    const res = await findSmallGroupMatchesWithEscalation(guestId, { scheduleSlot })
    setState("done")
    if (res.success) {
      setDirty(false)
      setLevels(res.data)
    } else {
      toast.error(res.error)
    }
  }

  async function handleAssign(groupId: string) {
    setAssigningId(groupId)
    const res = await assignGuestToGroupTemporarily(groupId, guestId)
    setAssigningId(null)
    if (res.success) {
      toast.success("Guest temporarily assigned — awaiting leader confirmation")
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  async function handleClearClaimed() {
    setClearingClaimed(true)
    const res = await clearGuestClaimedGroup(guestId)
    setClearingClaimed(false)
    if (res.success) {
      setLocalClaimedGroup(null)
      toast.success("Claimed group cleared")
    } else {
      toast.error(res.error)
    }
  }

  async function handleConfirmClaimed() {
    if (!localClaimedGroup) return
    await handleAssign(localClaimedGroup.id)
  }

  if (pipelineStatus === "Member") {
    return (
      <div className="max-w-2xl">
        <PipelineStepper status={pipelineStatus} />
      </div>
    )
  }

  if (pipelineStatus === "Pending") {
    return (
      <div className="max-w-2xl space-y-4">
        <PipelineStepper status={pipelineStatus} />
        {pendingGroupName && (
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-sm font-semibold">Awaiting leader confirmation</p>
            <p className="text-sm text-muted-foreground">
              Temporarily assigned to{" "}
              {pendingGroupId ? (
                <Link
                  href={`/small-groups/${pendingGroupId}`}
                  className="font-medium text-foreground underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors"
                >
                  {pendingGroupName}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{pendingGroupName}</span>
              )}.
            </p>
          </div>
        )}
      </div>
    )
  }

  if (pipelineStatus === "Matched" || pipelineStatus === "Declined") {
    const isDeclined = pipelineStatus === "Declined"
    return (
      <div className="max-w-2xl space-y-4">
        <PipelineStepper status={pipelineStatus} />
        {matchedBreakout && (
          <div className={["rounded-lg border p-4 space-y-3", isDeclined ? "border-destructive/40 bg-destructive/5" : ""].join(" ")}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Breakout Group Assignment</h3>
              {isDeclined && (
                <Badge variant="destructive" className="text-xs">Membership Declined</Badge>
              )}
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-32 shrink-0">Event</span>
                <span>{matchedBreakout.eventName}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-32 shrink-0">Breakout Group</span>
                <span>{matchedBreakout.breakoutGroupName}</span>
              </div>
              {matchedBreakout.linkedSmallGroup ? (
                <>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-32 shrink-0">Small Group</span>
                    <span>{matchedBreakout.linkedSmallGroup.name}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-32 shrink-0">Leader</span>
                    <span>
                      {matchedBreakout.linkedSmallGroup.leader
                        ? `${matchedBreakout.linkedSmallGroup.leader.firstName} ${matchedBreakout.linkedSmallGroup.leader.lastName}`
                        : <span className="text-muted-foreground">—</span>}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-32 shrink-0">Volunteer</span>
                  <span>
                    {matchedBreakout.facilitatorName ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
        {isDeclined && (
          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">
                Small Group Matching
                {dirty && (
                  <span className="ml-2 inline-block size-1.5 rounded-full bg-amber-500 align-middle" />
                )}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fill in the required fields and click Find matching groups.
                Assigning creates a pending request — the leader confirms via their link.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>
                Schedule <span className="text-destructive">*</span>
              </Label>
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-2">
                <span className="text-sm text-muted-foreground">On</span>
                <Select
                  value={prefs.scheduleDayOfWeek || "none"}
                  onValueChange={(v) => setPref("scheduleDayOfWeek", v === "none" ? "" : v)}
                >
                  <SelectTrigger className="h-auto w-auto min-w-28 border-0 border-b border-dashed border-foreground/40 rounded-none px-0.5 pb-0.5 shadow-none focus:ring-0 text-sm">
                    <SelectValue placeholder="day" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select day</SelectItem>
                    {DAYS_OF_WEEK.map((day) => (
                      <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">from</span>
                <input
                  type="time"
                  value={prefs.scheduleTimeStart}
                  onChange={(e) => setPref("scheduleTimeStart", e.target.value)}
                  className="h-auto w-auto border-0 border-b border-dashed border-foreground/40 bg-transparent pb-0.5 px-0.5 text-sm shadow-none outline-none focus:border-foreground/60"
                />
                <span className="text-sm text-muted-foreground">to</span>
                <input
                  type="time"
                  value={prefs.scheduleTimeEnd}
                  onChange={(e) => setPref("scheduleTimeEnd", e.target.value)}
                  className="h-auto w-auto border-0 border-b border-dashed border-foreground/40 bg-transparent pb-0.5 px-0.5 text-sm shadow-none outline-none focus:border-foreground/60"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Life Stage <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={prefs.lifeStageId}
                  onValueChange={(v) => setPref("lifeStageId", v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select life stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {lifeStages.map((ls) => (
                      <SelectItem key={ls.id} value={ls.id}>
                        {ls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  Primary Language <span className="text-destructive">*</span>
                </Label>
                <MultiSelect
                  options={LANGUAGE_OPTIONS}
                  value={prefs.language}
                  onChange={(v) => setPref("language", v)}
                  placeholder="Select language(s)"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                Meeting Preference <span className="text-destructive">*</span>
              </Label>
              <Select
                value={prefs.meetingPreference}
                onValueChange={(v) => setPref("meetingPreference", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select preference" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No preference</SelectItem>
                  <SelectItem value="Online">Online</SelectItem>
                  <SelectItem value="Hybrid">Hybrid</SelectItem>
                  <SelectItem value="InPerson">In Person</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select
                  value={prefs.gender}
                  onValueChange={(v) => setPref("gender", v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Work City</Label>
                <Select
                  value={prefs.workCity || "_none"}
                  onValueChange={(v) => setPref("workCity", v === "_none" ? "" : v)}
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

            <div className="space-y-2">
              <Label>Work Industry</Label>
              <Input
                placeholder="Technology"
                value={prefs.workIndustry}
                onChange={(e) => setPref("workIndustry", e.target.value)}
              />
            </div>

            <Button
              onClick={() => { void handleSearch() }}
              disabled={state === "loading"}
            >
              {state === "loading" ? (
                <IconLoader className="size-4 animate-spin" />
              ) : (
                <IconSparkles className="size-4" />
              )}
              {state === "loading" ? "Searching…" : "Find matching groups"}
            </Button>
          </section>
        )}

        {isDeclined && state === "done" && (
          <>
            {levels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No eligible groups found. All groups may be at capacity.
              </p>
            ) : (
              <div className="space-y-6">
                {levels.map((level) => (
                  <div key={level.level} className="space-y-3">
                    <p className="type-label text-muted-foreground">
                      {LEVEL_LABEL[level.level]}
                    </p>
                    {level.matches.map((r: MatchResult) => (
                      <SmallGroupMatchCard
                        key={r.groupId}
                        result={r}
                        onAssign={() => { void handleAssign(r.groupId) }}
                        assigning={assigningId === r.groupId}
                        onGroupClick={() => {
                          setSelectedGroupId(r.groupId)
                          setSheetOpen(true)
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <SmallGroupDetailSheet
          groupId={selectedGroupId}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
        />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* Pipeline stepper */}
      <PipelineStepper status={pipelineStatus} />

      {/* Claimed group banner */}
      {localClaimedGroup && (
        <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">Interested in joining a group</p>
            <p className="text-sm text-muted-foreground">
              {localClaimedGroup.name}
              {localClaimedGroup.leader && (
                <> · Led by {localClaimedGroup.leader.firstName} {localClaimedGroup.leader.lastName}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => { void handleConfirmClaimed() }}
              disabled={assigningId !== null || clearingClaimed}
            >
              {assigningId === localClaimedGroup.id ? "Assigning…" : "Assign (Pending Leader Confirmation)"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { void handleClearClaimed() }}
              disabled={clearingClaimed || assigningId !== null}
            >
              {clearingClaimed ? <IconLoader className="size-4 animate-spin" /> : <IconX className="size-4" />}
              Not in this group
            </Button>
          </div>
        </div>
      )}

      {/* Matching section */}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold">
            Small Group Matching
            {dirty && (
              <span className="ml-2 inline-block size-1.5 rounded-full bg-amber-500 align-middle" />
            )}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fill in the required fields and click Find matching groups.
            Assigning creates a pending request — the leader confirms via their link.
          </p>
        </div>

        {/* Schedule — first field */}
        <div className="space-y-1.5">
          <Label>
            Schedule <span className="text-destructive">*</span>
          </Label>
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-2">
            <span className="text-sm text-muted-foreground">On</span>
            <Select
              value={prefs.scheduleDayOfWeek || "none"}
              onValueChange={(v) => setPref("scheduleDayOfWeek", v === "none" ? "" : v)}
            >
              <SelectTrigger className="h-auto w-auto min-w-28 border-0 border-b border-dashed border-foreground/40 rounded-none px-0.5 pb-0.5 shadow-none focus:ring-0 text-sm">
                <SelectValue placeholder="day" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select day</SelectItem>
                {DAYS_OF_WEEK.map((day) => (
                  <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">from</span>
            <input
              type="time"
              value={prefs.scheduleTimeStart}
              onChange={(e) => setPref("scheduleTimeStart", e.target.value)}
              className="h-auto w-auto border-0 border-b border-dashed border-foreground/40 bg-transparent pb-0.5 px-0.5 text-sm shadow-none outline-none focus:border-foreground/60"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <input
              type="time"
              value={prefs.scheduleTimeEnd}
              onChange={(e) => setPref("scheduleTimeEnd", e.target.value)}
              className="h-auto w-auto border-0 border-b border-dashed border-foreground/40 bg-transparent pb-0.5 px-0.5 text-sm shadow-none outline-none focus:border-foreground/60"
            />
          </div>
        </div>

        {/* Required: Life Stage + Language */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>
              Life Stage <span className="text-destructive">*</span>
            </Label>
            <Select
              value={prefs.lifeStageId}
              onValueChange={(v) => setPref("lifeStageId", v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select life stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {lifeStages.map((ls) => (
                  <SelectItem key={ls.id} value={ls.id}>
                    {ls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>
              Primary Language <span className="text-destructive">*</span>
            </Label>
            <MultiSelect
              options={LANGUAGE_OPTIONS}
              value={prefs.language}
              onChange={(v) => setPref("language", v)}
              placeholder="Select language(s)"
            />
          </div>
        </div>

        {/* Required: Meeting Preference */}
        <div className="space-y-2">
          <Label>
            Meeting Preference <span className="text-destructive">*</span>
          </Label>
          <Select
            value={prefs.meetingPreference}
            onValueChange={(v) => setPref("meetingPreference", v === "none" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select preference" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No preference</SelectItem>
              <SelectItem value="Online">Online</SelectItem>
              <SelectItem value="Hybrid">Hybrid</SelectItem>
              <SelectItem value="InPerson">In Person</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Optional: Work City + Industry */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Work / Home City</Label>
            <Select
              value={prefs.workCity || "_none"}
              onValueChange={(v) => setPref("workCity", v === "_none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select city" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">No preference</SelectItem>
                {CITY_OPTIONS.map((city) => (
                  <SelectItem key={city} value={city}>
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Industry</Label>
            <Input
              value={prefs.workIndustry}
              onChange={(e) => setPref("workIndustry", e.target.value)}
              placeholder="Technology"
            />
          </div>
        </div>

        {/* Save & find match — end of form */}
        <Button
          onClick={() => { void handleSearch() }}
          disabled={state === "loading"}
        >
          {state === "loading" ? (
            <IconLoader className="size-4 animate-spin" />
          ) : (
            <IconSparkles className="size-4" />
          )}
          {state === "loading" ? "Searching…" : "Find matching groups"}
        </Button>
      </section>

      {/* Results */}
      {state === "done" && (
        <>
          {levels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No eligible groups found. All groups may be at capacity.
            </p>
          ) : (
            <div className="space-y-6">
              {levels.map((level) => (
                <div key={level.level} className="space-y-3">
                  <p className="type-label text-muted-foreground">
                    {LEVEL_LABEL[level.level]}
                  </p>
                  {level.matches.map((r: MatchResult) => (
                    <SmallGroupMatchCard
                      key={r.groupId}
                      result={r}
                      onAssign={() => { void handleAssign(r.groupId) }}
                      assigning={assigningId === r.groupId}
                      onGroupClick={() => {
                        setSelectedGroupId(r.groupId)
                        setSheetOpen(true)
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <SmallGroupDetailSheet
        groupId={selectedGroupId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  )
})
