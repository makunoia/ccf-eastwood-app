"use client"

import * as React from "react"
import { submitMemberConfirmations } from "./actions"

type RowDecision = "confirm" | "pending" | "decline"

type PendingRequest = {
  id: string
  type: "guest" | "member"
  name: string
  fromGroupName: string | null
  createdAt: Date
}

type Props = {
  token: string
  groupName: string
  pendingRequests: PendingRequest[]
}

function DecisionToggle({
  value,
  onChange,
}: {
  value: RowDecision
  onChange: (v: RowDecision) => void
}) {
  const options: {
    label: string
    value: RowDecision
    active: string
    inactive: string
  }[] = [
    {
      label: "Confirm",
      value: "confirm",
      active: "bg-green-600 text-white",
      inactive: "text-muted-foreground hover:text-green-700",
    },
    {
      label: "Pending",
      value: "pending",
      active: "bg-amber-500 text-white",
      inactive: "text-muted-foreground hover:text-amber-600",
    },
    {
      label: "Decline",
      value: "decline",
      active: "bg-red-600 text-white",
      inactive: "text-muted-foreground hover:text-red-600",
    },
  ]
  return (
    <div className="flex items-center rounded-md border overflow-hidden shrink-0 text-xs font-medium">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 transition-colors ${
            value === opt.value ? opt.active : `bg-background ${opt.inactive}`
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function ConfirmationClient({ token, groupName: _groupName, pendingRequests }: Props) {
  const [decisions, setDecisions] = React.useState<Record<string, RowDecision>>(() => {
    const init: Record<string, RowDecision> = {}
    for (const r of pendingRequests) init[r.id] = "pending"
    return init
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [error, setError] = React.useState("")

  // Rejection reason phase
  const [rejectionQueue, setRejectionQueue] = React.useState<PendingRequest[]>([])
  const [rejectionReasons, setRejectionReasons] = React.useState<Record<string, string>>({})
  const [currentReason, setCurrentReason] = React.useState("")
  const [reasonError, setReasonError] = React.useState("")
  const [stagedDecisions, setStagedDecisions] = React.useState<
    { requestId: string; status: "confirmed" | "pending" | "rejected"; notes?: string }[]
  >([])

  // ── Done ──────────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="text-center space-y-2">
        <div className="text-2xl">✓</div>
        <p className="font-medium text-lg">Thank you!</p>
        <p className="text-sm text-muted-foreground">
          Your responses have been submitted. The church admin has been notified.
        </p>
      </div>
    )
  }

  if (pendingRequests.length === 0) {
    return (
      <div className="text-center space-y-2">
        <p className="font-medium">You have no temporary members</p>
        <p className="text-sm text-muted-foreground">
          There are no pending membership requests for your group at this time.
        </p>
      </div>
    )
  }

  // ── Rejection reason phase ───────────────────────────────────────────────────
  if (rejectionQueue.length > 0) {
    const current = rejectionQueue[0]
    const total = Object.values(decisions).filter((d) => d === "decline").length
    const remaining = rejectionQueue.length

    async function handleReasonNext() {
      if (!currentReason.trim()) {
        setReasonError("Please provide a reason for declining.")
        return
      }
      setReasonError("")
      const updatedReasons = { ...rejectionReasons, [current.id]: currentReason.trim() }
      setRejectionReasons(updatedReasons)

      const nextQueue = rejectionQueue.slice(1)
      if (nextQueue.length > 0) {
        setRejectionQueue(nextQueue)
        setCurrentReason("")
        return
      }

      // All reasons collected — attach reasons to declined decisions and submit
      const fullDecisions = stagedDecisions.map((d) =>
        d.status === "rejected" ? { ...d, notes: updatedReasons[d.requestId] } : d
      )

      setSubmitting(true)
      const result = await submitMemberConfirmations(token, fullDecisions)
      setSubmitting(false)
      if (!result.success) {
        setError(result.error)
        setRejectionQueue([])
        return
      }
      setDone(true)
    }

    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Why are you declining?</p>
            <span className="text-xs text-muted-foreground">
              {remaining} of {total} remaining
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            A reason is required for every declined member.
          </p>
        </div>

        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <p className="font-medium text-sm">{current.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {current.type === "guest"
              ? "First-time member"
              : current.fromGroupName
                ? `Transferring from ${current.fromGroupName}`
                : "Transferring from another group"}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="reason" className="text-sm font-medium">
            Reason for declining
          </label>
          <textarea
            id="reason"
            rows={3}
            value={currentReason}
            onChange={(e) => {
              setCurrentReason(e.target.value)
              setReasonError("")
            }}
            placeholder="e.g. Not actively attending, prefers a different group…"
            autoFocus
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          {reasonError && <p className="text-xs text-destructive">{reasonError}</p>}
        </div>

        <button
          type="button"
          onClick={handleReasonNext}
          disabled={submitting}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Submitting…" : rejectionQueue.length > 1 ? "Next →" : "Submit"}
        </button>
      </div>
    )
  }

  // ── Main form ────────────────────────────────────────────────────────────────
  const confirmedCount = Object.values(decisions).filter((d) => d === "confirm").length
  const declinedCount = Object.values(decisions).filter((d) => d === "decline").length

  async function handleSubmit() {
    setError("")
    const decisionList = pendingRequests.map((r) => ({
      requestId: r.id,
      status:
        decisions[r.id] === "confirm"
          ? ("confirmed" as const)
          : decisions[r.id] === "decline"
            ? ("rejected" as const)
            : ("pending" as const),
    }))

    const declined = pendingRequests.filter((r) => decisions[r.id] === "decline")
    if (declined.length > 0) {
      setStagedDecisions(decisionList)
      setRejectionQueue(declined)
      setCurrentReason("")
      return
    }

    setSubmitting(true)
    const result = await submitMemberConfirmations(token, decisionList)
    setSubmitting(false)
    if (result.success) {
      setDone(true)
    } else {
      setError(result.error)
    }
  }

  function getButtonLabel() {
    if (submitting) return "Submitting…"
    const parts: string[] = []
    if (confirmedCount > 0) parts.push(`${confirmedCount} confirmed`)
    if (declinedCount > 0) parts.push(`${declinedCount} declined`)
    const pendingCount = pendingRequests.length - confirmedCount - declinedCount
    if (pendingCount > 0) parts.push(`${pendingCount} pending`)
    return parts.length > 0 ? `Submit (${parts.join(", ")})` : "Submit"
  }

  return (
    <div className="space-y-5">
      {/* Instructions banner */}
      <div className="rounded-xl border-2 border-primary/25 bg-primary/5 p-4 space-y-3">
        <p className="text-sm font-bold leading-none">Mark each person below</p>
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-600 text-white">
              Confirm
            </span>
            <p className="text-xs text-foreground/75">
              They&apos;re joining your small group
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500 text-white">
              Pending
            </span>
            <p className="text-xs text-foreground/75">
              Not sure yet — keep their request open
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-600 text-white">
              Decline
            </span>
            <p className="text-xs text-foreground/75">
              Not joining — you&apos;ll be asked for a reason
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y border rounded-lg overflow-hidden">
        {pendingRequests.map((req) => (
          <div key={req.id} className="flex items-center gap-3 p-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm leading-tight">{req.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {req.type === "guest"
                  ? "First-time member"
                  : req.fromGroupName
                    ? `Transferring from ${req.fromGroupName}`
                    : "Transferring from another group"}
              </p>
            </div>
            <DecisionToggle
              value={decisions[req.id] ?? "pending"}
              onChange={(v) =>
                setDecisions((prev) => ({ ...prev, [req.id]: v }))
              }
            />
          </div>
        ))}
      </div>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {getButtonLabel()}
      </button>
    </div>
  )
}
