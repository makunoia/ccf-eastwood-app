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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { WEIGHT_FIELDS } from "@/lib/validations/matching-weights"
import { LANGUAGE_OPTIONS, CITY_OPTIONS } from "@/lib/constants/group-options"
import { findSmallGroupMatchesForMember, assignMemberToSmallGroup } from "../matching-actions"
import { assignMemberTransferTemporarily } from "@/app/(dashboard)/small-groups/actions"
import { saveMemberMatchingPreferences } from "../actions"
import type { MatchResult, ScoreBreakdown } from "@/lib/matching/types"

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  )
}

function MatchCard({
  result,
  onAssign,
  assigning,
  isTransfer,
}: {
  result: MatchResult
  onAssign: () => void
  assigning: boolean
  isTransfer: boolean
}) {
  const score = Math.round(result.totalScore * 100)
  const [detailsOpen, setDetailsOpen] = React.useState(false)

  return (
    <>
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">{result.groupName}</p>
            <p className="text-sm text-muted-foreground">{score}% match</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDetailsOpen(true)}>
              See Details
            </Button>
            <Button size="sm" onClick={onAssign} disabled={assigning}>
              {assigning
                ? (isTransfer ? "Transferring…" : "Assigning…")
                : (isTransfer ? "Transfer" : "Assign")}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{result.groupName}</DialogTitle>
            <DialogDescription>{score}% overall match</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {WEIGHT_FIELDS.map((field) => {
              const raw = result.breakdown[field.key as keyof ScoreBreakdown]
              return (
                <div key={field.key} className="grid grid-cols-[120px_1fr_32px] items-center gap-2">
                  <span className="text-xs text-muted-foreground truncate">{field.label}</span>
                  <ScoreBar value={raw} />
                  <span className="text-xs tabular-nums text-right">
                    {Math.round(raw * 100)}%
                  </span>
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
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
    if (!prefs.gender) { toast.error("Gender is required"); return }
    if (prefs.language.length === 0) { toast.error("Language is required"); return }
    if (!prefs.meetingPreference) { toast.error("Meeting Preference is required"); return }

    setState("loading")

    const saveRes = await saveMemberMatchingPreferences(memberId, prefs)
    if (!saveRes.success) {
      setState("idle")
      toast.error(saveRes.error)
      return
    }

    const res = await findSmallGroupMatchesForMember(memberId)
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

        {/* Required: Life Stage + Gender */}
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
              Gender <span className="text-destructive">*</span>
            </Label>
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
        </div>

        {/* Required: Language */}
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
                <MatchCard
                  key={r.groupId}
                  result={r}
                  onAssign={() => { void handleAssign(r.groupId) }}
                  assigning={assigningId === r.groupId}
                  isTransfer={hasGroup}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
