"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconSparkles, IconLoader } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { WEIGHT_FIELDS } from "@/lib/validations/matching-weights"
import { findSmallGroupMatchesForGuest } from "../matching-actions"
import { promoteGuestToMember } from "../actions"
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

export function GuestMatchSection({
  guestId,
  isPromoted,
}: {
  guestId: string
  isPromoted: boolean
}) {
  const router = useRouter()
  const [state, setState] = React.useState<"idle" | "loading" | "done">("idle")
  const [results, setResults] = React.useState<MatchResult[]>([])
  const [assigningId, setAssigningId] = React.useState<string | null>(null)

  async function handleSearch() {
    setState("loading")
    const res = await findSmallGroupMatchesForGuest(guestId)
    setState("done")
    if (res.success) {
      setResults(res.data)
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

  if (isPromoted) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        This guest has been promoted to a member and is already in a small group.
      </p>
    )
  }

  return (
    <div className="max-w-2xl space-y-4">
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
          onClick={handleSearch}
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
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
