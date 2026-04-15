"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconSparkles, IconLoader, IconX } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { WEIGHT_FIELDS } from "@/lib/validations/matching-weights"
import { findSmallGroupMatchesWithEscalation } from "../matching-actions"
import { promoteGuestToMember, clearGuestClaimedGroup } from "../actions"
import type { MatchResult, ScoreBreakdown, EscalationLevel } from "@/lib/matching/types"
import type { GuestPipelineStatus } from "@/lib/guest-utils"

// ─── Score components ─────────────────────────────────────────────────────────

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
}: {
  result: MatchResult
  onAssign: () => void
  assigning: boolean
}) {
  const score = Math.round(result.totalScore * 100)

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{result.groupName}</p>
          <p className="text-sm text-muted-foreground">{score}% match</p>
        </div>
        <Button size="sm" onClick={onAssign} disabled={assigning}>
          {assigning ? "Assigning…" : "Assign"}
        </Button>
      </div>

      <div className="space-y-2">
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
    </div>
  )
}

// ─── Pipeline status badge ────────────────────────────────────────────────────

const PIPELINE_BADGE: Record<GuestPipelineStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  New:          { label: "New",           variant: "secondary" },
  EventAttendee:{ label: "Event Attendee",variant: "outline"   },
  Matched:      { label: "Matched",       variant: "default"   },
  Member:       { label: "Member",        variant: "default"   },
}

// ─── Level labels ─────────────────────────────────────────────────────────────

const LEVEL_LABEL: Record<1 | 2 | 3, string> = {
  1: "Breakout facilitator's group",
  2: "Other event volunteer groups",
  3: "All small groups",
}

// ─── Main section ─────────────────────────────────────────────────────────────

type ClaimedGroup = {
  id: string
  name: string
  leader: { id: string; firstName: string; lastName: string } | null
} | null

export function GuestMatchSection({
  guestId,
  pipelineStatus,
  claimedGroup,
}: {
  guestId: string
  pipelineStatus: GuestPipelineStatus
  claimedGroup: ClaimedGroup
}) {
  const router = useRouter()
  const [state, setState] = React.useState<"idle" | "loading" | "done">("idle")
  const [levels, setLevels] = React.useState<EscalationLevel[]>([])
  const [assigningId, setAssigningId] = React.useState<string | null>(null)
  const [clearingClaimed, setClearingClaimed] = React.useState(false)
  const [localClaimedGroup, setLocalClaimedGroup] = React.useState<ClaimedGroup>(claimedGroup)

  async function handleSearch() {
    setState("loading")
    const res = await findSmallGroupMatchesWithEscalation(guestId)
    setState("done")
    if (res.success) {
      setLevels(res.data)
    } else {
      toast.error(res.error)
    }
  }

  async function handleAssign(groupId: string) {
    setAssigningId(groupId)
    const res = await promoteGuestToMember(guestId, groupId)
    setAssigningId(null)
    if (res.success) {
      toast.success("Guest promoted to member and assigned to group")
      router.push(`/members/${res.data.memberId}`)
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
      <p className="text-sm text-muted-foreground py-4">
        This guest has been promoted to a member and is already in a small group.
      </p>
    )
  }

  const { label, variant } = PIPELINE_BADGE[pipelineStatus]

  return (
    <div className="max-w-2xl space-y-4">
      {/* Pipeline status badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Pipeline stage:</span>
        <Badge variant={variant}>{label}</Badge>
      </div>

      {/* Claimed group banner */}
      {localClaimedGroup && (
        <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium">Interested in joining a group</p>
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
              {assigningId === localClaimedGroup.id ? "Assigning…" : "Confirm → Promote to Member"}
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Small Group Matching</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Find the best-fit small group based on this guest&apos;s profile.
            Assigning will promote them to a member.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
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
      </div>

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
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {LEVEL_LABEL[level.level]}
                  </p>
                  {level.matches.map((r: MatchResult) => (
                    <MatchCard
                      key={r.groupId}
                      result={r}
                      onAssign={() => { void handleAssign(r.groupId) }}
                      assigning={assigningId === r.groupId}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
