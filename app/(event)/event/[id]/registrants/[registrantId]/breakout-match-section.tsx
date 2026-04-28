"use client"

import * as React from "react"
import { IconSparkles, IconLoader, IconList } from "@tabler/icons-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WEIGHT_FIELDS } from "@/lib/validations/matching-weights"
import {
  findBreakoutGroupMatches,
  assignRegistrantToBreakout,
} from "@/app/(dashboard)/events/matching-actions"
import type { MatchResult, ScoreBreakdown } from "@/lib/matching/types"

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

// ─── Auto-match card ──────────────────────────────────────────────────────────

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
              <span className="truncate text-xs text-muted-foreground">{field.label}</span>
              <ScoreBar value={raw} />
              <span className="text-right text-xs tabular-nums">{Math.round(raw * 100)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

type EventGroup = {
  id: string
  name: string
  memberLimit: number | null
  currentCount: number
}

type Props = {
  registrantId: string
  eventId: string
  /** Set when this registrant is a volunteer facilitating a breakout group */
  facilitatedGroup: { id: string; name: string } | null
  /** All breakout groups in this event (for direct assignment) */
  allEventGroups: EventGroup[]
}

// ─── Breakout section ─────────────────────────────────────────────────────────

export function BreakoutSection({ registrantId, eventId, facilitatedGroup, allEventGroups }: Props) {
  const router = useRouter()
  const [mode, setMode] = React.useState<"auto" | "browse">("auto")
  const [matchState, setMatchState] = React.useState<"idle" | "loading" | "done">("idle")
  const [matchResults, setMatchResults] = React.useState<MatchResult[]>([])
  const [assigningId, setAssigningId] = React.useState<string | null>(null)

  // ── Facilitator view ──────────────────────────────────────────────────────

  if (facilitatedGroup) {
    return (
      <div className="space-y-3">
        <h3 className="type-label text-muted-foreground">Breakout Group</h3>
        <div className="rounded-lg border p-3 flex items-center justify-between gap-3">
          <p className="text-sm font-medium">{facilitatedGroup.name}</p>
          <Badge variant="secondary">Facilitator</Badge>
        </div>
      </div>
    )
  }

  // ── Assign handler ────────────────────────────────────────────────────────

  async function handleAssign(groupId: string) {
    setAssigningId(groupId)
    const res = await assignRegistrantToBreakout(groupId, registrantId, eventId)
    setAssigningId(null)
    if (res.success) {
      toast.success("Assigned to breakout group")
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  // ── Auto-match ────────────────────────────────────────────────────────────

  async function handleSearch() {
    setMatchState("loading")
    const res = await findBreakoutGroupMatches(registrantId, eventId)
    setMatchState("done")
    if (res.success) setMatchResults(res.data)
    else toast.error(res.error)
  }

  const autoMatchContent = (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Find the best-fit group based on this registrant&apos;s profile.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSearch}
          disabled={matchState === "loading"}
        >
          {matchState === "loading" ? (
            <IconLoader className="size-4 animate-spin" />
          ) : (
            <IconSparkles className="size-4" />
          )}
          {matchState === "loading" ? "Searching…" : "Find Match"}
        </Button>
      </div>
      {matchState === "done" && (
        matchResults.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No eligible breakout groups found. All groups may be at capacity.
          </p>
        ) : (
          <div className="space-y-3">
            {matchResults.map((r) => (
              <MatchCard
                key={r.groupId}
                result={r}
                onAssign={() => { void handleAssign(r.groupId) }}
                assigning={assigningId === r.groupId}
              />
            ))}
          </div>
        )
      )}
    </div>
  )

  const browseContent = (
    <div className="space-y-2">
      {allEventGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No breakout groups have been created for this event.</p>
      ) : (
        allEventGroups.map((g) => {
          const isFull = g.memberLimit !== null && g.currentCount >= g.memberLimit
          return (
            <div key={g.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5 gap-3">
              <div>
                <p className="text-sm font-medium">{g.name}</p>
                {g.memberLimit !== null && (
                  <p className="text-xs text-muted-foreground">
                    {g.currentCount} / {g.memberLimit} members
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { void handleAssign(g.id) }}
                disabled={isFull || assigningId === g.id}
              >
                {assigningId === g.id ? "Assigning…" : isFull ? "Full" : "Assign"}
              </Button>
            </div>
          )
        })
      )}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="type-label text-muted-foreground">Breakout Group</h3>
        <div className="flex rounded-md border overflow-hidden">
          <button
            className={[
              "flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors",
              mode === "auto" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            ].join(" ")}
            onClick={() => setMode("auto")}
          >
            <IconSparkles className="size-3.5" />
            Auto-Match
          </button>
          <button
            className={[
              "flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors border-l",
              mode === "browse" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            ].join(" ")}
            onClick={() => setMode("browse")}
          >
            <IconList className="size-3.5" />
            Browse
          </button>
        </div>
      </div>

      {mode === "auto" ? autoMatchContent : browseContent}
    </div>
  )
}
