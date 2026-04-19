"use client"

import * as React from "react"
import {
  submitCatchMechConfirmations,
  createSmallGroupForTimothy,
  type ConfirmDecision,
} from "../actions"

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

export function CatchMechConfirmClient({ token, groupName: _groupName, isTimothy: _isTimothy, rows }: Props) {
  const pendingRows = rows.filter((r) => !r.isConfirmed)
  const alreadyConfirmed = rows.filter((r) => r.isConfirmed)

  const [checked, setChecked] = React.useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const r of pendingRows) init[r.registrantId] = true
    return init
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState("")

  // Timothy name-collection phase
  const [needsGroupName, setNeedsGroupName] = React.useState(false)
  const [groupName_, setGroupName_] = React.useState("")
  const [pendingDecisions, setPendingDecisions] = React.useState<ConfirmDecision[]>([])

  const [done, setDone] = React.useState(false)
  const [createdGroupName, setCreatedGroupName] = React.useState("")

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
            const result = await createSmallGroupForTimothy(token, groupName_, pendingDecisions)
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

  const confirmedCount = Object.values(checked).filter(Boolean).length

  async function handleSubmit() {
    setError("")
    setSubmitting(true)
    const decisions: ConfirmDecision[] = pendingRows.map((r) => ({
      registrantId: r.registrantId,
      confirmed: checked[r.registrantId] ?? false,
    }))
    const result = await submitCatchMechConfirmations(token, decisions)
    setSubmitting(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    if (result.requiresGroupName) {
      // Only pass the confirmed ones to the group creation step
      setPendingDecisions(decisions.filter((d) => d.confirmed))
      setNeedsGroupName(true)
      return
    }
    setDone(true)
  }

  return (
    <div className="space-y-5">
      {alreadyConfirmed.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {alreadyConfirmed.length} member{alreadyConfirmed.length !== 1 ? "s" : ""} already confirmed
        </p>
      )}

      <p className="text-sm text-muted-foreground text-center">
        Tick the boxes below to confirm members into your group. Untick to decline.
      </p>

      <div className="divide-y border rounded-lg overflow-hidden">
        {pendingRows.map((r) => (
          <label
            key={r.registrantId}
            className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/40 transition-colors"
          >
            <input
              type="checkbox"
              checked={checked[r.registrantId] ?? false}
              onChange={(e) =>
                setChecked((prev) => ({ ...prev, [r.registrantId]: e.target.checked }))
              }
              className="h-4 w-4 accent-primary"
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{r.name}</p>
              <p className="text-xs text-muted-foreground">
                {r.type === "guest" ? "First-time attendee" : "Returning member"}
              </p>
            </div>
            <span
              className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                checked[r.registrantId]
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {checked[r.registrantId] ? "Confirm" : "Decline"}
            </span>
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-destructive text-center">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || confirmedCount === 0}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {submitting
          ? "Submitting…"
          : confirmedCount === pendingRows.length
          ? `Confirm all ${pendingRows.length}`
          : `Submit (${confirmedCount} confirmed, ${pendingRows.length - confirmedCount} declined)`}
      </button>
    </div>
  )
}
