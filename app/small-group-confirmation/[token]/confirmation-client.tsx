"use client"

import * as React from "react"
import { submitMemberConfirmations } from "./actions"

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

export function ConfirmationClient({ token, groupName, pendingRequests }: Props) {
  const [checked, setChecked] = React.useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const r of pendingRequests) initial[r.id] = true
    return initial
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [error, setError] = React.useState("")

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

  async function handleSubmit() {
    setError("")
    setSubmitting(true)
    const decisions = pendingRequests.map((r) => ({
      requestId: r.id,
      confirmed: checked[r.id] ?? false,
    }))
    const result = await submitMemberConfirmations(token, decisions)
    setSubmitting(false)
    if (result.success) {
      setDone(true)
    } else {
      setError(result.error)
    }
  }

  const confirmedCount = Object.values(checked).filter(Boolean).length

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground text-center">
        You have been assigned{" "}
        <span className="font-semibold text-foreground">
          {pendingRequests.length} new member{pendingRequests.length !== 1 ? "s" : ""}
        </span>
        . Tick the boxes below to confirm their membership to your group.
        Untick to decline.
      </p>

      <div className="divide-y border rounded-lg overflow-hidden">
        {pendingRequests.map((req) => (
          <label
            key={req.id}
            className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/40 transition-colors"
          >
            <input
              type="checkbox"
              checked={checked[req.id] ?? false}
              onChange={(e) =>
                setChecked((prev) => ({ ...prev, [req.id]: e.target.checked }))
              }
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm leading-tight">{req.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {req.type === "guest"
                  ? "New member (first-time)"
                  : req.fromGroupName
                    ? `Transferring from ${req.fromGroupName}`
                    : "Transferring from another group"}
              </p>
            </div>
            <span
              className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                checked[req.id]
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {checked[req.id] ? "Confirm" : "Decline"}
            </span>
          </label>
        ))}
      </div>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {submitting
          ? "Submitting…"
          : confirmedCount === pendingRequests.length
            ? `Confirm all ${pendingRequests.length} member${pendingRequests.length !== 1 ? "s" : ""}`
            : `Submit (${confirmedCount} confirmed, ${pendingRequests.length - confirmedCount} declined)`}
      </button>
    </div>
  )
}
