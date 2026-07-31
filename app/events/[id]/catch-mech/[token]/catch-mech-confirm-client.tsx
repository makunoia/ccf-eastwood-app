"use client"

import * as React from "react"
import {
  submitCatchMechConfirmations,
  createSmallGroupForTimothy,
} from "../actions"
import {
  applyDeclineReasons,
  type ConfirmDecision,
  type DeclineReasonEntry,
} from "@/lib/catch-mech/decisions"
import { callAction, SUBMIT_NETWORK_ERROR } from "@/lib/forms/call-action"
import type { DeclineReason } from "@/app/generated/prisma/client"
import { DECLINE_REASON_OPTIONS } from "@/lib/decline-reason"
import type { CandidateGroup } from "@/lib/catch-mech/targets"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type RowDecision = "confirm" | "pending" | "decline"

type RowData = {
  registrantId: string
  name: string
  type: "member" | "guest"
}

type Props = {
  token: string
  groupName: string
  isTimothy: boolean
  /** Groups this faci can absorb someone into. >1 shows a per-person picker. */
  candidates: CandidateGroup[]
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
    <div className="flex items-center rounded-md border overflow-hidden text-xs font-medium w-full sm:w-auto sm:shrink-0">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 sm:flex-none px-2.5 py-1.5 sm:py-1 text-center transition-colors ${
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

export function CatchMechConfirmClient({ token, groupName: _groupName, isTimothy: _isTimothy, candidates, rows }: Props) {
  // Resolved (confirmed/rejected) registrants are filtered out server-side, so every
  // row here still needs a decision.
  const pendingRows = rows

  // With one destination there is nothing to choose — the server implies it.
  const needsGroupChoice = candidates.length > 1

  const [decisions, setDecisions] = React.useState<Record<string, RowDecision>>(() => {
    const init: Record<string, RowDecision> = {}
    for (const r of pendingRows) init[r.registrantId] = "pending"
    return init
  })
  // Per-person destination, defaulted to the linked group (candidates[0]).
  const [targets, setTargets] = React.useState<Record<string, string>>({})
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState("")

  // Decline-reason collection. The queue is walked by index rather than consumed,
  // so Back can step to the previous person and re-open their saved answer.
  const [declineQueue, setDeclineQueue] = React.useState<RowData[]>([])
  const [reasonIndex, setReasonIndex] = React.useState(0)
  const [rejectionReasons, setRejectionReasons] = React.useState<Record<string, DeclineReasonEntry>>({})
  const [selectedReason, setSelectedReason] = React.useState<DeclineReason | "">("")
  const [otherReasonText, setOtherReasonText] = React.useState("")
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
            Your DGroup <span className="font-medium text-foreground">&quot;{createdGroupName}&quot;</span> has been created and your members are in.
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
            Let&apos;s set up your DGroup. Give it a name to get started.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="groupName" className="text-sm font-medium">
            DGroup Name
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
            const result = await callAction(
              () => createSmallGroupForTimothy(token, groupName_, finalDecisions),
              "createSmallGroupForTimothy"
            )
            setSubmitting(false)
            if (!result) {
              setError(SUBMIT_NETWORK_ERROR)
            } else if (result.success) {
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

  // ── Decline reason phase ────────────────────────────────────────────────────
  if (declineQueue.length > 0) {
    const current = declineQueue[reasonIndex]
    const total = declineQueue.length
    const isLast = reasonIndex === total - 1

    /** Re-opens a person's saved answer so Back shows what they already picked. */
    function openReasonFor(row: RowData, reasons: Record<string, DeclineReasonEntry>) {
      const saved = reasons[row.registrantId]
      setSelectedReason(saved?.declineReason ?? "")
      setOtherReasonText(saved?.note ?? "")
      setReasonError("")
    }

    /** Keeps the current pick so stepping away and back doesn't discard it. */
    function retainCurrentReason(): Record<string, DeclineReasonEntry> {
      if (!selectedReason) return rejectionReasons
      const kept = {
        ...rejectionReasons,
        [current.registrantId]: {
          declineReason: selectedReason,
          ...(selectedReason === "Others" ? { note: otherReasonText.trim() } : {}),
        },
      }
      setRejectionReasons(kept)
      return kept
    }

    function handleReasonBack() {
      const kept = retainCurrentReason()
      if (reasonIndex === 0) {
        // Back out to the member list. Decisions are untouched, so every toggle the
        // faci set is still there — this is an escape hatch for "I picked Decline by
        // mistake", which was otherwise unreachable without reloading the page.
        setDeclineQueue([])
        setReasonError("")
        return
      }
      const previous = declineQueue[reasonIndex - 1]
      setReasonIndex(reasonIndex - 1)
      openReasonFor(previous, kept)
    }

    async function handleReasonNext() {
      if (!selectedReason) {
        setReasonError("Please select a reason for declining.")
        return
      }
      if (selectedReason === "Others" && !otherReasonText.trim()) {
        setReasonError("Please specify the reason for declining.")
        return
      }
      setReasonError("")
      const entry: DeclineReasonEntry = {
        declineReason: selectedReason,
        ...(selectedReason === "Others" ? { note: otherReasonText.trim() } : {}),
      }
      const updatedReasons = { ...rejectionReasons, [current.registrantId]: entry }
      setRejectionReasons(updatedReasons)

      if (!isLast) {
        const next = declineQueue[reasonIndex + 1]
        setReasonIndex(reasonIndex + 1)
        openReasonFor(next, updatedReasons)
        return
      }

      // All reasons collected — build final decisions and submit
      const fullDecisions = applyDeclineReasons(stagedDecisions, updatedReasons)

      setSubmitting(true)
      const result = await callAction(
        () => submitCatchMechConfirmations(token, fullDecisions),
        "submitCatchMechConfirmations"
      )
      setSubmitting(false)
      if (!result) {
        // Same reasoning as below: hold this screen so the collected reasons survive
        // a retry instead of being thrown away by a bounce back to the list.
        setReasonError(SUBMIT_NETWORK_ERROR)
        return
      }
      if (!result.success) {
        // Stay on this screen. Clearing the queue would drop the faci back to the
        // member list, which reads as "it forgot my declines" — the error is then
        // offscreen at the bottom of a long list and never gets seen.
        setReasonError(result.error)
        return
      }
      if (result.requiresGroupName) {
        setFinalDecisions(fullDecisions)
        setNeedsGroupName(true)
        setDeclineQueue([])
        return
      }
      setDone(true)
    }

    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Why are you declining?</p>
            <span className="text-xs text-muted-foreground">{reasonIndex + 1} of {total}</span>
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
          <p className="text-sm font-medium">Reason for declining</p>
          <div className="space-y-2" role="radiogroup" aria-label="Reason for declining">
            {DECLINE_REASON_OPTIONS.map((option) => {
              const selected = selectedReason === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => { setSelectedReason(option.value); setReasonError("") }}
                  className={`w-full flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm text-left transition-colors ${
                    selected
                      ? "border-primary bg-primary/5 font-medium"
                      : "bg-background hover:bg-muted/50"
                  }`}
                >
                  <span
                    className={`shrink-0 size-4 rounded-full border flex items-center justify-center ${
                      selected ? "border-primary" : "border-muted-foreground/40"
                    }`}
                  >
                    {selected && <span className="size-2 rounded-full bg-primary" />}
                  </span>
                  {option.label}
                </button>
              )
            })}
          </div>
          {selectedReason === "Others" && (
            <textarea
              rows={3}
              value={otherReasonText}
              onChange={(e) => { setOtherReasonText(e.target.value); setReasonError("") }}
              placeholder="Please specify the reason…"
              autoFocus
              aria-label="Specify the reason for declining"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          )}
          {reasonError && <p className="text-xs text-destructive">{reasonError}</p>}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReasonBack}
            disabled={submitting}
            className="shrink-0 rounded-lg border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted/50 disabled:opacity-50 transition-colors"
          >
            {reasonIndex === 0 ? "← Back to list" : "← Back"}
          </button>
          <button
            type="button"
            onClick={handleReasonNext}
            disabled={submitting}
            className="flex-1 rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Submitting…" : isLast ? "Submit" : "Next →"}
          </button>
        </div>
      </div>
    )
  }

  // ── Everyone already resolved (confirmed or declined) ───────────────────────
  if (pendingRows.length === 0) {
    return (
      <div className="text-center space-y-2 py-4">
        <p className="font-medium">All members reviewed</p>
        <p className="text-sm text-muted-foreground">
          Everyone from your table has already been confirmed or declined.
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
      ...(decisions[r.registrantId] === "confirm" && needsGroupChoice
        ? { targetGroupId: targets[r.registrantId] ?? candidates[0].id }
        : {}),
    }))

    const declined = pendingRows.filter((r) => decisions[r.registrantId] === "decline")
    if (declined.length > 0) {
      // Collect decline reasons one-by-one before submitting. Re-entering after a
      // Back-to-list re-opens whatever was already answered rather than blanking it.
      const saved = rejectionReasons[declined[0].registrantId]
      setStagedDecisions(decisionList)
      setDeclineQueue(declined)
      setReasonIndex(0)
      setSelectedReason(saved?.declineReason ?? "")
      setOtherReasonText(saved?.note ?? "")
      setReasonError("")
      return
    }

    // No rejections — submit immediately
    setSubmitting(true)
    const result = await callAction(
      () => submitCatchMechConfirmations(token, decisionList),
      "submitCatchMechConfirmations"
    )
    setSubmitting(false)
    if (!result) {
      setError(SUBMIT_NETWORK_ERROR)
      return
    }
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
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
        <p className="text-sm font-semibold">Mark each person below</p>
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-600 text-white">
              Confirm
            </span>
            <p className="text-xs text-foreground/75">Joining your DGroup</p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500 text-white">
              Pending
            </span>
            <p className="text-xs text-foreground/75">Not sure yet, keep the request open</p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-600 text-white">
              Decline
            </span>
            <p className="text-xs text-foreground/75">Not joining, you&apos;ll be asked for a reason</p>
          </div>
        </div>
      </div>

      <div className="divide-y border rounded-lg overflow-hidden">
        {pendingRows.map((r) => (
          <div key={r.registrantId} className="p-4 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="min-w-0 sm:flex-1">
                <p className="font-medium text-sm wrap-break-word">{r.name}</p>
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

            {needsGroupChoice && decisions[r.registrantId] === "confirm" && (
              <div className="space-y-1.5">
                <label
                  htmlFor={`group-${r.registrantId}`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  Which group will {r.name.split(" ")[0]} join?
                </label>
                <Select
                  value={targets[r.registrantId] ?? candidates[0].id}
                  onValueChange={(v) =>
                    setTargets((prev) => ({ ...prev, [r.registrantId]: v }))
                  }
                >
                  <SelectTrigger id={`group-${r.registrantId}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
