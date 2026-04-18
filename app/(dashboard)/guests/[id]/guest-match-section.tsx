"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconSparkles, IconLoader, IconX } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { WEIGHT_FIELDS } from "@/lib/validations/matching-weights"
import { findSmallGroupMatchesWithEscalation } from "../matching-actions"
import { clearGuestClaimedGroup } from "../actions"
import { assignGuestToGroupTemporarily } from "../../small-groups/actions"
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

// ─── Pipeline stepper ────────────────────────────────────────────────────────

const PIPELINE_STAGES: GuestPipelineStatus[] = ["New", "EventAttendee", "Matched", "Pending", "Member"]
const STAGE_LABEL: Record<GuestPipelineStatus, string> = {
  New: "New",
  EventAttendee: "Event Attendee",
  Matched: "Matched",
  Pending: "Pending",
  Member: "Member",
}
const STAGE_DESCRIPTION: Record<GuestPipelineStatus, string> = {
  New: "Registered but has not yet attended an event.",
  EventAttendee: "Has attended at least one event but hasn't been placed in a breakout group yet.",
  Matched: "Was placed in a breakout group at an event and is ready to be connected to a small group.",
  Pending: "Has a pending small group assignment — awaiting confirmation from the group leader.",
  Member: "Has joined a small group and been promoted to a full member.",
}

function PipelineStepper({ status }: { status: GuestPipelineStatus }) {
  const activeIndex = PIPELINE_STAGES.indexOf(status)
  // px depth of the chevron point
  const CHEVRON = 18

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex">
        {PIPELINE_STAGES.map((stage, i) => {
          const isActive = i === activeIndex
          const isPast = i < activeIndex
          const isFirst = i === 0
          const isLast = i === PIPELINE_STAGES.length - 1

          // Chevron polygon: right edge points right; left edge indents inward (except first)
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
                isActive
                  ? "bg-foreground text-background"
                  : isPast
                  ? "bg-muted text-foreground/50"
                  : "bg-muted/40 text-muted-foreground/60",
              ].join(" ")}
              style={{
                clipPath,
                // Pull each segment left so the previous arrow overlaps this indent
                marginLeft: i > 0 ? `-${CHEVRON}px` : undefined,
                // Left segments sit on top so arrows are visible
                zIndex: PIPELINE_STAGES.length - i,
                // Inner padding: compensate for the indent on the left side
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

// ─── Main section ─────────────────────────────────────────────────────────────

type ClaimedGroup = {
  id: string
  name: string
  leader: { id: string; firstName: string; lastName: string } | null
} | null

type MatchedBreakout = {
  eventName: string
  breakoutGroupName: string
  linkedSmallGroup: {
    name: string
    leader: { firstName: string; lastName: string } | null
  } | null
} | null

export function GuestMatchSection({
  guestId,
  pipelineStatus,
  claimedGroup,
  pendingGroupName,
  matchedBreakout,
}: {
  guestId: string
  pipelineStatus: GuestPipelineStatus
  claimedGroup: ClaimedGroup
  pendingGroupName: string | null
  matchedBreakout: MatchedBreakout
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
            <p className="text-sm font-medium">Awaiting leader confirmation</p>
            <p className="text-sm text-muted-foreground">
              Temporarily assigned to{" "}
              <span className="font-medium text-foreground">{pendingGroupName}</span>.
            </p>
          </div>
        )}
      </div>
    )
  }

  if (pipelineStatus === "Matched") {
    return (
      <div className="max-w-2xl space-y-4">
        <PipelineStepper status={pipelineStatus} />
        {matchedBreakout && (
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-medium">Breakout Group Assignment</h3>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-32 shrink-0">Event</span>
                <span>{matchedBreakout.eventName}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-32 shrink-0">Breakout Group</span>
                <span>{matchedBreakout.breakoutGroupName}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-32 shrink-0">Small Group</span>
                <span>
                  {matchedBreakout.linkedSmallGroup?.name ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-32 shrink-0">Leader</span>
                <span>
                  {matchedBreakout.linkedSmallGroup?.leader
                    ? `${matchedBreakout.linkedSmallGroup.leader.firstName} ${matchedBreakout.linkedSmallGroup.leader.lastName}`
                    : <span className="text-muted-foreground">—</span>}
                </span>
              </div>
            </div>
          </div>
        )}
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Small Group Matching</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Find the best-fit small group based on this guest&apos;s profile.
            Assigning creates a pending request — the leader confirms via their link.
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
