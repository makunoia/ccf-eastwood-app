"use client"

import * as React from "react"
import {
  submitCatchMechConfirmations,
  createSmallGroupForTimothy,
  type ConfirmDecision,
} from "../actions"

type RowDecision = "confirm" | "pending" | "decline"

type RowData = {
  registrantId: string
  name: string
  type: "member" | "guest"
  isConfirmed: boolean
}

type Props = {
  token: string
  groupName: string
  isTimothy: boolean
  rows: RowData[]
}

// ─── Reusable decision toggle ─────────────────────────────────────────────────

function DecisionToggle({
  value,
  onChange,
}: {
  value: RowDecision
  onChange: (v: RowDecision) => void
}) {
  const options: { label: string; value: RowDecision; active: string; inactive: string }[] = [
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

// ─── Main component ───────────────────────────────────────────────────────────

export function CatchMechConfirmClient({ token, groupName: _groupName, isTimothy: _isTimothy, rows }: Props) {
  const pendingRows = rows.filter((r) => !r.isConfirmed)
  const alreadyConfirmed = rows.filter((r) => r.isConfirmed)

  const [decisions, setDecisions] = React.useState<Record<string, RowDecision>>(() => {
    const init: Record<string, RowDecision> = {}
    for (const r of pendingRows) init[r.registrantId] = "pending"
    return init
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState("")

  // Rejection reason collection — queue of declined rows needing a reason
  const [rejectionQueue, setRejectionQueue] = React.useState<RowData[]>([])
  const [rejectionReasons, setRejectionReasons] = React.useState<Record<string, string>>({})
  const [currentReason, setCurrentReason] = React.useState("")
  const [reasonError, setReasonError] = React.useState("")
  // Decisions accumulated before entering rejection-reason phase
  const [stagedDecisions, setStagedDecisions] = React.useState<ConfirmDecision[]>([])

  // Timothy name-collection phase
  const [needsGroupName, setNeedsGroupName] = React.useState(false)
  const [groupName_, setGroupName_] = React.useState("")
  const [finalDecisions, setFinalDecisions] = React.useState<ConfirmDecision[]>([])

  const [done, setDone] = React.useState(false)
  const [createdGroupName, setCreatedGroupName] = React.useState("")

  // ── Done ────────────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="text-center space-y-3">
        <div className="text-3xl">🎉</div>
        <p className="font-semibold text-lg">Done!</p>
        {createdGroupName ? (
          <p className="text-sm text-muted-foreground">
            Your small group <span className="font-medium text-foreground">&quot;{createdGroupName}&quot;</span> has been created and your members are in.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your confirmations have been submitted.
          </p>
        )}
      </div>
    )
  }

  // ── Group name phase (Timothy) ───────────────────────────────────────────────
  if (needsGroupName) {
    return (
      <div className="space-y-5">
        <div className="text-center space-y-2">
          <div className="text-3xl">🎊</div>
          <p className="font-semibold">You confirmed your first member!</p>
          <p className="text-sm text-muted-foreground">
            Let&apos;s set up your small group. Give it a name to get started.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="groupName" className="text-sm font-medium">
            Small Group Name
          </label>
          <input
            id="groupName"
            value={groupName_}
            onChange={(e) => setGroupName_(e.target.value)}
            placeholder="e.g. Makati East Cell"
            autoFocus
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="button"
          onClick={async () => {
            if (!groupName_.trim()) { setError("Group name is required"); return }
            setError("")
            setSubmitting(true)
            const result = await createSmallGroupForTimothy(token, groupName_, finalDecisions)
            setSubmitting(false)
            if (result.success) {
              setCreatedGroupName(groupName_.trim())
              setDone(true)
            } else {
              setError(result.error)
            }
          }}
          disabled={submitting}
          className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Creating…" : "Create Group & Confirm Members"}
        </button>
      </div>
    )
  }

  // ── Rejection reason phase ──────────────────────────────────────────────────
  if (rejectionQueue.length > 0) {
    const current = rejectionQueue[0]
    const remaining = rejectionQueue.length
    const total = Object.values(decisions).filter((d) => d === "decline").length

    async function handleReasonNext() {
      if (!currentReason.trim()) {
        setReasonError("Please provide a reason for declining.")
        return
      }
      setReasonError("")
      const updatedReasons = { ...rejectionReasons, [current.registrantId]: currentReason.trim() }
      setRejectionReasons(updatedReasons)

      const nextQueue = rejectionQueue.slice(1)
      if (nextQueue.length > 0) {
        setRejectionQueue(nextQueue)
        setCurrentReason("")
        return
      }

      // All reasons collected — build final decisions and submit
      const fullDecisions: ConfirmDecision[] = stagedDecisions.map((d) =>
        d.status === "declined" ? { ...d, reason: updatedReasons[d.registrantId] } : d
      )

      setSubmitting(true)
      const result = await submitCatchMechConfirmations(token, fullDecisions)
      setSubmitting(false)
      if (!result.success) {
        setError(result.error)
        setRejectionQueue([])
        return
      }
      if (result.requiresGroupName) {
        setFinalDecisions(fullDecisions)
        setNeedsGroupName(true)
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
            <span className="text-xs text-muted-foreground">{remaining} of {total} remaining</span>
          </div>
          <p className="text-xs text-muted-foreground">
            A reason is required for every declined member.
          </p>
        </div>

        <div className="rounded-lg border bg-muted/30 px-4 py-3">
          <p className="font-medium text-sm">{current.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {current.type === "guest" ? "First-time attendee" : "Returning member"}
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
            onChange={(e) => { setCurrentReason(e.target.value); setReasonError("") }}
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

  // ── All confirmed already ───────────────────────────────────────────────────
  if (pendingRows.length === 0) {
    return (
      <div className="text-center space-y-2 py-4">
        <p className="font-medium">All members confirmed</p>
        <p className="text-sm text-muted-foreground">
          Everyone from your table has already been confirmed into your group.
        </p>
      </div>
    )
  }

  // ── Main form ───────────────────────────────────────────────────────────────
  const confirmedCount = Object.values(decisions).filter((d) => d === "confirm").length
  const declinedCount = Object.values(decisions).filter((d) => d === "decline").length

  async function handleSubmit() {
    setError("")
    const decisionList: ConfirmDecision[] = pendingRows.map((r) => ({
      registrantId: r.registrantId,
      status: decisions[r.registrantId] === "confirm"
        ? "confirmed"
        : decisions[r.registrantId] === "decline"
        ? "declined"
        : "pending",
    }))

    const declined = pendingRows.filter((r) => decisions[r.registrantId] === "decline")
    if (declined.length > 0) {
      // Collect rejection reasons one-by-one before submitting
      setStagedDecisions(decisionList)
      setRejectionQueue(declined)
      setCurrentReason("")
      return
    }

    // No rejections — submit immediately
    setSubmitting(true)
    const result = await submitCatchMechConfirmations(token, decisionList)
    setSubmitting(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    if (result.requiresGroupName) {
      setFinalDecisions(decisionList)
      setNeedsGroupName(true)
      return
    }
    setDone(true)
  }

  function getButtonLabel() {
    if (submitting) return "Submitting…"
    const parts: string[] = []
    if (confirmedCount > 0) parts.push(`${confirmedCount} confirmed`)
    if (declinedCount > 0) parts.push(`${declinedCount} declined`)
    const pendingCount = pendingRows.length - confirmedCount - declinedCount
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
            <p className="text-xs text-foreground/75">They&apos;re joining your small group</p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500 text-white">
              Pending
            </span>
            <p className="text-xs text-foreground/75">Not sure yet — keep their request open</p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-600 text-white">
              Decline
            </span>
            <p className="text-xs text-foreground/75">Not joining — you&apos;ll be asked for a reason</p>
          </div>
        </div>
      </div>

      {alreadyConfirmed.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {alreadyConfirmed.length} member{alreadyConfirmed.length !== 1 ? "s" : ""} already confirmed
        </p>
      )}

      <div className="divide-y border rounded-lg overflow-hidden">
        {pendingRows.map((r) => (
          <div key={r.registrantId} className="flex items-center gap-3 p-4">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{r.name}</p>
              <p className="text-xs text-muted-foreground">
                {r.type === "guest" ? "First-time attendee" : "Returning member"}
              </p>
            </div>
            <DecisionToggle
              value={decisions[r.registrantId] ?? "pending"}
              onChange={(v) =>
                setDecisions((prev) => ({ ...prev, [r.registrantId]: v }))
              }
            />
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive text-center">{error}</p>}

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
