"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconSparkles, IconLoader } from "@tabler/icons-react"
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
import { SmallGroupDetailSheet } from "@/components/small-group-detail-sheet"
import {
  findCatchMechSmallGroupMatches,
  assignCatchMechRegistrantToGroup,
  type CatchMechEscalationLevel,
  type CatchMechMatchResult,
} from "../../matching-actions"
import { saveGuestMatchingProfile } from "@/app/(dashboard)/guests/actions"
import type { ScoreBreakdown } from "@/lib/matching/types"

// ─── Types ────────────────────────────────────────────────────────────────────

type MatchingPrefs = {
  lifeStageId: string
  language: string[]
  meetingPreference: string
  workCity: string
  workIndustry: string
}

export type CatchMechMatchSectionHandle = {
  save: () => Promise<boolean>
}

type Props = {
  registrantId: string
  eventId: string
  guestId: string
  initialPrefs: MatchingPrefs
  lifeStages: { id: string; name: string }[]
}

// ─── Score bar ────────────────────────────────────────────────────────────────

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

// ─── Match card ───────────────────────────────────────────────────────────────

function MatchCard({
  result,
  onAssign,
  assigning,
  showVolunteerInfo,
  onGroupClick,
}: {
  result: CatchMechMatchResult
  onAssign: () => void
  assigning: boolean
  showVolunteerInfo: boolean
  onGroupClick: () => void
}) {
  const score = Math.round(result.totalScore * 100)
  const [detailsOpen, setDetailsOpen] = React.useState(false)

  return (
    <>
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={onGroupClick}
              className="font-medium text-left underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors cursor-pointer"
            >
              {result.groupName}
            </button>
            <p className="text-sm text-muted-foreground">{score}% match</p>
            {showVolunteerInfo && result.volunteerInfo && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {result.volunteerInfo.committeeName} · {result.volunteerInfo.roleName}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDetailsOpen(true)}>
              See Details
            </Button>
            <Button size="sm" onClick={onAssign} disabled={assigning}>
              {assigning ? "Assigning…" : "Assign"}
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

// ─── Main component ───────────────────────────────────────────────────────────

export const CatchMechMatchSection = React.forwardRef<CatchMechMatchSectionHandle, Props>(
  function CatchMechMatchSection({ registrantId, eventId, guestId, initialPrefs, lifeStages }, ref) {
  const router = useRouter()
  const [scope, setScope] = React.useState<"volunteers" | "all">("volunteers")
  const [searchState, setSearchState] = React.useState<"idle" | "loading" | "done">("idle")
  const [levels, setLevels] = React.useState<CatchMechEscalationLevel[]>([])
  const [assigningId, setAssigningId] = React.useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = React.useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = React.useState(false)

  const prefsRef = React.useRef(initialPrefs)
  const [prefs, setPrefs] = React.useState<MatchingPrefs>(initialPrefs)

  React.useImperativeHandle(ref, () => ({
    async save(): Promise<boolean> {
      const res = await saveGuestMatchingProfile(guestId, {
        lifeStageId: prefsRef.current.lifeStageId || null,
        language: prefsRef.current.language,
        meetingPreference: (prefsRef.current.meetingPreference as "Online" | "Hybrid" | "InPerson") || null,
        workCity: prefsRef.current.workCity || null,
        workIndustry: prefsRef.current.workIndustry || null,
      })
      if (res.success) {
        toast.success("Matching profile saved")
        return true
      } else {
        toast.error(res.error)
        return false
      }
    },
  }))

  function setPref<K extends keyof MatchingPrefs>(key: K, value: MatchingPrefs[K]) {
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

    setSearchState("loading")
    const res = await findCatchMechSmallGroupMatches(registrantId, eventId, scope)
    setSearchState("done")
    if (res.success) {
      setLevels(res.data)
    } else {
      toast.error(res.error)
    }
  }

  async function handleAssign(groupId: string) {
    setAssigningId(groupId)
    const res = await assignCatchMechRegistrantToGroup(registrantId, eventId, groupId)
    setAssigningId(null)
    if (res.success) {
      toast.success("Assigned — awaiting leader confirmation")
      // Redirect to pending page
      router.push(`/event/${eventId}/catch-mech/pending/${registrantId}`)
    } else {
      toast.error(res.error)
    }
  }

  return (
    <div className="space-y-4">
      {/* Scope selector */}
      <div>
        <h3 className="text-sm font-medium mb-2">Small Group Matching</h3>
        <div className="flex rounded-lg border overflow-hidden w-fit">
          {(["volunteers", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setScope(s); setLevels([]); setSearchState("idle") }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                scope === s
                  ? "bg-foreground text-background"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {s === "volunteers" ? "Volunteers in this event" : "All groups"}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          {scope === "volunteers"
            ? "Candidates are small groups whose leader is a confirmed volunteer in this event."
            : "All small groups in the database."}
        </p>
      </div>

      {/* Form */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Life Stage <span className="text-destructive">*</span></Label>
          <Select
            value={prefs.lifeStageId}
            onValueChange={(v) => setPref("lifeStageId", v === "none" ? "" : v)}
          >
            <SelectTrigger><SelectValue placeholder="Select life stage" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {lifeStages.map((ls) => (
                <SelectItem key={ls.id} value={ls.id}>{ls.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Primary Language <span className="text-destructive">*</span></Label>
          <MultiSelect
            options={LANGUAGE_OPTIONS}
            value={prefs.language}
            onChange={(v) => setPref("language", v)}
            placeholder="Select language(s)"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Meeting Preference <span className="text-destructive">*</span></Label>
        <Select
          value={prefs.meetingPreference}
          onValueChange={(v) => setPref("meetingPreference", v === "none" ? "" : v)}
        >
          <SelectTrigger><SelectValue placeholder="Select preference" /></SelectTrigger>
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
          <Label>Work / Home City</Label>
          <Select
            value={prefs.workCity || "_none"}
            onValueChange={(v) => setPref("workCity", v === "_none" ? "" : v)}
          >
            <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">No preference</SelectItem>
              {CITY_OPTIONS.map((city) => (
                <SelectItem key={city} value={city}>{city}</SelectItem>
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

      <Button
        onClick={() => { void handleSearch() }}
        disabled={searchState === "loading"}
      >
        {searchState === "loading" ? (
          <IconLoader className="size-4 animate-spin" />
        ) : (
          <IconSparkles className="size-4" />
        )}
        {searchState === "loading" ? "Searching…" : "Find Best Match"}
      </Button>

      {/* Results */}
      {searchState === "done" && (
        <>
          {levels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No eligible groups found. All groups may be at capacity.
            </p>
          ) : (
            <div className="space-y-6">
              {levels.map((level) => (
                <div key={level.level} className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {level.source === "event-volunteers" ? "Volunteers in this event" : "All small groups"}
                  </p>
                  {level.matches.map((r: CatchMechMatchResult) => (
                    <MatchCard
                      key={r.groupId}
                      result={r}
                      onAssign={() => { void handleAssign(r.groupId) }}
                      assigning={assigningId === r.groupId}
                      showVolunteerInfo={scope === "volunteers"}
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
)