"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { FIELD_META, scoreBand } from "@/components/matching/factor-meta"
import { GroupTypeBadge } from "@/components/group-type-badge"
import {
  ACTIVE_WEIGHT_FIELDS,
  GATE_FIELDS,
} from "@/lib/validations/matching-weights"
import type { MatchResult, GroupSummary } from "@/lib/matching/types"

// ─── Fit reasons ──────────────────────────────────────────────────────────────

export type FitAssessment = {
  /** Measured factors that fit well. */
  strengths: string[]
  /** Measured factors that fit poorly — the honest counterweight. */
  considerations: string[]
}

const STRENGTH_THRESHOLD = 0.9
const CONSIDERATION_THRESHOLD = 0.4

/**
 * Turns a scored match into human-readable fit reasons.
 *
 * Only speaks to factors that were actually MEASURED (coverage=true) — an
 * unknown factor is neither a strength nor a concern, it's just absent. This is
 * what keeps the CCF-19 rule ("only show fields present in the profile") true,
 * and — unlike the old positives-only version — a weak match now surfaces its
 * real weak points instead of the "compatibility is high" fallback.
 */
export function buildFitReasons(result: MatchResult): FitAssessment {
  const { breakdown, coverage } = result
  const strengths: string[] = []
  const considerations: string[] = []

  const assess = (
    key: keyof typeof breakdown,
    strong: string,
    weak: string
  ) => {
    if (!coverage[key]) return
    if (breakdown[key] >= STRENGTH_THRESHOLD) strengths.push(strong)
    else if (breakdown[key] <= CONSIDERATION_THRESHOLD) considerations.push(weak)
  }

  assess("lifeStage", "Life stage aligns with this group.", "Life stage differs from this group's focus.")
  assess("language", "Language preferences overlap.", "No shared language with this group.")
  assess("schedule", "Schedule fits the group's meeting time.", "Schedule doesn't line up with the meeting time.")
  assess("mode", "Meeting format matches their preference.", "Meeting format differs from their preference.")
  // Gender is only worth mentioning when the group has a SPECIFIC focus — for a
  // mixed group "gender focus is compatible" is vacuously true of everyone.
  if (result.groupSummary.genderFocus && result.groupSummary.genderFocus !== "Mixed") {
    assess("gender", "Gender focus is compatible.", "Gender focus doesn't match.")
  }
  assess("location", "Located near the group.", "Works in a different area from the group.")
  assess("age", "Age fits the group's range.", "Age sits outside the group's range.")
  assess("career", "Shares an industry with current members.", "Different industry from current members.")
  assess("capacity", "Group has room to grow.", "Group is nearly full.")

  return { strengths, considerations }
}

// ─── Factor breakdown grid (admin-only) ───────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  const period = h < 12 ? "AM" : "PM"
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, "0")} ${period}`
}

const MODE_LABEL: Record<string, string> = { Online: "Online", Hybrid: "Hybrid", InPerson: "In person" }

/** A short description of the group's setting for a factor — the "compared
 *  against what?" context beside each bar. */
function groupValue(key: keyof MatchResult["breakdown"], s: GroupSummary): string {
  switch (key) {
    case "lifeStage":
      return s.lifeStageNames.length ? s.lifeStageNames.join(", ") : "Any life stage"
    case "gender":
      return s.genderFocus ?? "Any gender"
    case "language":
      return s.language.length ? s.language.join(", ") : "Any language"
    case "age":
      if (s.ageRangeMin != null && s.ageRangeMax != null) return `${s.ageRangeMin}–${s.ageRangeMax} yrs`
      if (s.ageRangeMin != null) return `${s.ageRangeMin}+ yrs`
      if (s.ageRangeMax != null) return `up to ${s.ageRangeMax} yrs`
      return "Any age"
    case "schedule": {
      if (s.scheduleSlots.length === 0) return "No set schedule"
      return s.scheduleSlots
        .map((slot) => `${DAY_NAMES[slot.dayOfWeek]} ${formatTime(slot.timeStart)}`)
        .join(", ")
    }
    case "location":
      return s.locationCity ?? "Any location"
    case "mode":
      return s.meetingFormat ? MODE_LABEL[s.meetingFormat] ?? s.meetingFormat : "Any format"
    case "career":
      return s.industryPeerCount === 1 ? "1 member in same field" : `${s.industryPeerCount} members in same field`
    case "capacity":
      return `${s.currentCount}/${s.memberLimit ?? "—"} members`
  }
}

function FactorRow({ result, factorKey, isGate }: {
  result: MatchResult
  factorKey: keyof MatchResult["breakdown"]
  isGate?: boolean
}) {
  const { icon: Icon, color } = FIELD_META[factorKey]
  const known = result.coverage[factorKey]
  const score = result.breakdown[factorKey]
  const band = scoreBand(score, known, isGate)
  const fieldLabel =
    [...GATE_FIELDS, ...ACTIVE_WEIGHT_FIELDS].find((f) => f.key === factorKey)?.label ?? factorKey

  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: known ? `${color}18` : undefined }}
      >
        <Icon className="size-4" style={{ color: known ? color : "hsl(var(--muted-foreground))" }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium leading-snug">{fieldLabel}</p>
          <Badge variant="outline" className={`text-xs shrink-0 ${band.className}`}>
            {band.label}
          </Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">{groupValue(factorKey, result.groupSummary)}</p>
        {known && !isGate && (
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.round(score * 100)}%`, backgroundColor: color }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export function MatchBreakdown({ result }: { result: MatchResult }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Requirements met
        </p>
        <div className="divide-y">
          {GATE_FIELDS.map((f) => (
            <FactorRow key={f.key} result={result} factorKey={f.key} isGate />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Weighted factors
        </p>
        <div className="divide-y">
          {ACTIVE_WEIGHT_FIELDS.map((f) => (
            <FactorRow key={f.key} result={result} factorKey={f.key} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Match card ───────────────────────────────────────────────────────────────

type SmallGroupMatchCardProps = {
  result: MatchResult
  onAssign: () => void
  assigning: boolean
  /** If provided, the group name renders as a clickable button. */
  onGroupClick?: () => void
  /** Action button label. Defaults to "Assign". */
  assignLabel?: string
  /** Action button label while in-flight. Defaults to "Assigning…". */
  assigningLabel?: string
  /** Optional subtitle rendered below the match percentage (e.g. volunteer info). */
  subtitle?: string
  /** Admin surfaces pass this to reveal the per-factor breakdown grid. Kept off
   *  by default so it never renders on the public join page. */
  showBreakdown?: boolean
}

export function SmallGroupMatchCard({
  result,
  onAssign,
  assigning,
  onGroupClick,
  assignLabel = "Assign",
  assigningLabel = "Assigning…",
  subtitle,
  showBreakdown = false,
}: SmallGroupMatchCardProps) {
  const score = Math.round(result.totalScore * 100)
  const [detailsOpen, setDetailsOpen] = React.useState(false)
  const { strengths, considerations } = buildFitReasons(result)
  const lowConfidence = result.confidence < 0.5

  return (
    <>
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              {onGroupClick ? (
                <button
                  type="button"
                  onClick={onGroupClick}
                  className="font-medium text-left underline decoration-dashed underline-offset-2 decoration-foreground/50 hover:decoration-foreground transition-colors cursor-pointer"
                >
                  {result.groupName}
                </button>
              ) : (
                <p className="font-medium">{result.groupName}</p>
              )}
              <GroupTypeBadge groupType={result.groupSummary.groupType} />
            </div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{score}% match</p>
              {result.onCooldown && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                  Recently assigned a guest
                </Badge>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDetailsOpen(true)}>
              See Details
            </Button>
            <Button size="sm" onClick={onAssign} disabled={assigning}>
              {assigning ? assigningLabel : assignLabel}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{result.groupName}</DialogTitle>
            <DialogDescription>
              {score === 100 ? "Perfect fit based on the current profile" : `${score}% overall match`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {lowConfidence && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Limited profile information — this score is based on only part of the
                profile.
              </p>
            )}

            {strengths.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Why this group fits
                </p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {strengths.map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
              </div>
            )}

            {considerations.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Worth considering
                </p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {considerations.map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
              </div>
            )}

            {strengths.length === 0 && considerations.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ranked on limited profile information — add more detail to the
                profile for a sharper match.
              </p>
            )}

            {showBreakdown && <MatchBreakdown result={result} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
