"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import type { MatchResult } from "@/lib/matching/types"

// ─── Fit reasons ──────────────────────────────────────────────────────────────

export function buildFitReasons(result: MatchResult): string[] {
  const reasons: string[] = []
  const score = result.breakdown
  const p = result.candidateProfile

  const hasLifeStage = p.lifeStageId !== null
  const hasGender = p.gender !== null
  const hasLanguage = p.language.length > 0
  const hasAge = p.birthMonth !== null && p.birthYear !== null
  const hasSchedule = p.scheduleSlots.length > 0
  const hasLocation = p.workCity !== null
  const hasMode = p.meetingPreference !== null
  const hasCareer = p.workIndustry !== null

  if (hasLifeStage && score.lifeStage >= 1) reasons.push("Life stage aligns with this group.")
  if (hasLanguage && score.language >= 1) reasons.push("Language preferences overlap strongly.")
  if (hasSchedule && score.schedule >= 1) reasons.push("Schedule overlaps with the selected day and time range.")
  if (hasMode && score.mode >= 1) reasons.push("Meeting format matches preferred style.")
  if (hasGender && score.gender >= 1) reasons.push("Gender focus is compatible.")
  if (hasLocation && score.location >= 1) reasons.push("Location preference is a direct match.")
  if (hasAge && score.age >= 0.9) reasons.push("Age profile fits the group range.")
  if (hasCareer && score.career >= 0.6) reasons.push("Career/industry profile is similar to current members.")
  if (score.capacity > 0.5) reasons.push("Group has healthy remaining capacity.")

  if (reasons.length === 0) {
    reasons.push("Overall compatibility is high across multiple profile factors.")
  }

  return reasons
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
}

export function SmallGroupMatchCard({
  result,
  onAssign,
  assigning,
  onGroupClick,
  assignLabel = "Assign",
  assigningLabel = "Assigning…",
  subtitle,
}: SmallGroupMatchCardProps) {
  const score = Math.round(result.totalScore * 100)
  const [detailsOpen, setDetailsOpen] = React.useState(false)
  const reasons = buildFitReasons(result)

  return (
    <>
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
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
            <p className="text-sm text-muted-foreground">{score}% match</p>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{result.groupName}</DialogTitle>
            <DialogDescription>
              {score === 100 ? "Perfect fit based on the current profile" : `${score}% overall match`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Why this group is a good fit
            </p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {reasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
