"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconSparkles, IconLoader, IconClock } from "@tabler/icons-react"
import { toast } from "sonner"

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
import { findSmallGroupMatchesForMember, assignMemberToSmallGroup } from "../matching-actions"
import { assignMemberTransferTemporarily } from "@/app/(dashboard)/small-groups/actions"
import { saveMemberMatchingPreferences } from "../actions"
import type { MatchResult } from "@/lib/matching/types"

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

type PendingTransfer = {
  id: string
  toGroupName: string
  createdAt: Date
}

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

export function MemberMatchSection({
  memberId,
  hasGroup,
  pendingTransfer,
  initialPrefs,
  lifeStages,
}: {
  memberId: string
  hasGroup: boolean
  pendingTransfer?: PendingTransfer | null
  initialPrefs: MatchingPrefs
  lifeStages: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [state, setState] = React.useState<"idle" | "loading" | "done">("idle")
  const [results, setResults] = React.useState<MatchResult[]>([])
  const [assigningId, setAssigningId] = React.useState<string | null>(null)

  const [prefs, setPrefs] = React.useState<MatchingPrefs>(initialPrefs)
  function setPref<K extends keyof MatchingPrefs>(key: K, value: MatchingPrefs[K]) {
    setPrefs((prev) => ({ ...prev, [key]: value }))
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

    const saveRes = await saveMemberMatchingPreferences(memberId, prefs)
    if (!saveRes.success) {
      setState("idle")
      toast.error(saveRes.error)
      return
    }

    const scheduleSlot = buildScheduleSlot(prefs)
    const res = await findSmallGroupMatchesForMember(memberId, { scheduleSlot })
    setState("done")
    if (res.success) {
      setResults(res.data)
    } else {
      toast.error(res.error)
    }
  }

  async function handleAssign(groupId: string) {
    setAssigningId(groupId)
    const res = hasGroup
      ? await assignMemberTransferTemporarily(groupId, memberId)
      : await assignMemberToSmallGroup(memberId, groupId)
    setAssigningId(null)
    if (res.success) {
      toast.success(hasGroup
        ? "Transfer request created — pending leader confirmation"
        : "Member assigned to group"
      )
      router.refresh()
      setState("idle")
      setResults([])
    } else {
      toast.error(res.error)
    }
  }

  if (pendingTransfer) {
    return (
      <div className="max-w-2xl space-y-3">
        <h3 className="text-sm font-medium">Small Group Matching</h3>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <IconClock className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-900">
                Transfer pending — {pendingTransfer.toGroupName}
              </p>
              <p className="text-xs text-amber-700">
                A transfer request to this group is awaiting leader confirmation. The matching tool is unavailable until the request is resolved.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-4">
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">Small Group Matching</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasGroup
              ? "Find a better-fit small group for this member. Matching will create a transfer request pending leader confirmation."
              : "Find the best-fit small group based on this member's profile."}
          </p>
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

        <div className="space-y-2">
          <Label>
            Schedule <span className="text-destructive">*</span>
          </Label>
          <div className="grid grid-cols-3 gap-3">
            <Select
              value={prefs.scheduleDayOfWeek || "none"}
              onValueChange={(v) => setPref("scheduleDayOfWeek", v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Day" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select day</SelectItem>
                {DAYS_OF_WEEK.map((day) => (
                  <SelectItem key={day.value} value={day.value}>
                    {day.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="time"
              value={prefs.scheduleTimeStart}
              onChange={(e) => setPref("scheduleTimeStart", e.target.value)}
            />
            <Input
              type="time"
              value={prefs.scheduleTimeEnd}
              onChange={(e) => setPref("scheduleTimeEnd", e.target.value)}
            />
          </div>
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

        {/* Find Best Match — end of form */}
        <Button
          onClick={() => { void handleSearch() }}
          disabled={state === "loading"}
        >
          {state === "loading" ? (
            <IconLoader className="size-4 animate-spin" />
          ) : (
            <IconSparkles className="size-4" />
          )}
          {state === "loading" ? "Searching…" : "Find Best Match"}
        </Button>
      </section>

      {state === "done" && (
        <>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No eligible groups found. All groups may be at capacity.
            </p>
          ) : (
            <div className="space-y-3">
              {results.map((r: MatchResult) => (
                <SmallGroupMatchCard
                  key={r.groupId}
                  result={r}
                  onAssign={() => { void handleAssign(r.groupId) }}
                  assigning={assigningId === r.groupId}
                  assignLabel={hasGroup ? "Transfer" : "Assign"}
                  assigningLabel={hasGroup ? "Transferring…" : "Assigning…"}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
