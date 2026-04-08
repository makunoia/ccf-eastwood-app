"use client"

import * as React from "react"
import { IconSparkles, IconLoader } from "@tabler/icons-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { WEIGHT_FIELDS } from "@/lib/validations/matching-weights"
import {
  findBreakoutGroupMatches,
  assignRegistrantToBreakout,
} from "@/app/(dashboard)/events/matching-actions"
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
            <div
              key={field.key}
              className="grid grid-cols-[120px_1fr_32px] items-center gap-2"
            >
              <span className="truncate text-xs text-muted-foreground">
                {field.label}
              </span>
              <ScoreBar value={raw} />
              <span className="text-right text-xs tabular-nums">
                {Math.round(raw * 100)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function BreakoutMatchSection({
  registrantId,
  eventId,
}: {
  registrantId: string
  eventId: string
}) {
  const router = useRouter()
  const [state, setState] = React.useState<"idle" | "loading" | "done">("idle")
  const [results, setResults] = React.useState<MatchResult[]>([])
  const [assigningId, setAssigningId] = React.useState<string | null>(null)

  async function handleSearch() {
    setState("loading")
    const res = await findBreakoutGroupMatches(registrantId, eventId)
    setState("done")
    if (res.success) {
      setResults(res.data)
    } else {
      toast.error(res.error)
    }
  }

  async function handleAssign(groupId: string) {
    setAssigningId(groupId)
    const res = await assignRegistrantToBreakout(groupId, registrantId, eventId)
    setAssigningId(null)
    if (res.success) {
      toast.success("Registrant assigned to breakout group")
      router.refresh()
    } else {
      toast.error(res.error)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Breakout Group</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Find the best-fit breakout group based on this registrant&apos;s profile.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSearch}
          disabled={state === "loading"}
        >
          {state === "loading" ? (
            <IconLoader className="size-4 animate-spin" />
          ) : (
            <IconSparkles className="size-4" />
          )}
          {state === "loading" ? "Searching…" : "Search Breakout Group"}
        </Button>
      </div>

      {state === "done" && (
        <>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No eligible breakout groups found. All groups may be at capacity or
              this registrant is already assigned to all groups.
            </p>
          ) : (
            <div className="space-y-3">
              {results.map((r: MatchResult) => (
                <MatchCard
                  key={r.groupId}
                  result={r}
                  onAssign={() => { void handleAssign(r.groupId) }}
                  assigning={assigningId === r.groupId}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
