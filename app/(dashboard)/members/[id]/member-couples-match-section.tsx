"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconHeart, IconLoader, IconSparkles } from "@tabler/icons-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { CoupleMatchResult } from "@/lib/matching"
import { findCouplesGroupMatchesForMember } from "../matching-actions"
import { requestCoupleAssignment } from "@/app/(dashboard)/small-groups/actions"

function pct(score: number): string {
  return `${Math.round(score * 100)}%`
}

export function MemberCouplesMatchSection({
  memberId,
  memberFirstName,
  spouse,
}: {
  memberId: string
  memberFirstName: string
  spouse: { memberId: string; firstName: string; lastName: string }
}) {
  const router = useRouter()
  const [state, setState] = React.useState<"idle" | "loading" | "done">("idle")
  const [results, setResults] = React.useState<CoupleMatchResult[]>([])
  const [requestingId, setRequestingId] = React.useState<string | null>(null)

  async function handleSearch() {
    setState("loading")
    const res = await findCouplesGroupMatchesForMember(memberId, spouse.memberId)
    setState("done")
    if (res.success) {
      setResults(res.data)
    } else {
      toast.error(res.error)
      setState("idle")
    }
  }

  async function handleRequest(groupId: string) {
    setRequestingId(groupId)
    const res = await requestCoupleAssignment(groupId, memberId, spouse.memberId)
    setRequestingId(null)
    if (res.success) {
      toast.success("Couple request created — pending leader confirmation")
      router.refresh()
      setState("idle")
      setResults([])
    } else {
      toast.error(res.error)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <section className="space-y-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <IconHeart className="size-4 text-rose-500" />
            Couples Group Matching
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Suggests couples groups scored jointly for {memberFirstName} and{" "}
            {spouse.firstName} {spouse.lastName} — ranked by the fit of the
            less-well-matched spouse. Requesting creates a paired request pending
            leader confirmation.
          </p>
        </div>

        <Button onClick={() => { void handleSearch() }} disabled={state === "loading"} variant="outline">
          {state === "loading" ? (
            <IconLoader className="size-4 animate-spin" />
          ) : (
            <IconSparkles className="size-4" />
          )}
          {state === "loading" ? "Searching…" : "Find couples groups"}
        </Button>
      </section>

      {state === "done" && (
        results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No eligible couples groups found. Groups may be at capacity or none
            match both spouses&apos; profiles.
          </p>
        ) : (
          <div className="space-y-3">
            {results.map((r) => (
              <div key={r.groupId} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{r.groupName}</p>
                  <Badge variant="secondary" className="bg-rose-100 text-rose-800 border-transparent">
                    {pct(r.combinedScore)} match
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {memberFirstName}: {pct(r.resultA.totalScore)} · {spouse.firstName}:{" "}
                  {pct(r.resultB.totalScore)}
                </p>
                <Button
                  size="sm"
                  onClick={() => { void handleRequest(r.groupId) }}
                  disabled={requestingId !== null}
                >
                  {requestingId === r.groupId ? "Requesting…" : "Request as couple"}
                </Button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
