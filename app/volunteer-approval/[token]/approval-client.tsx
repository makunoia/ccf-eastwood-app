"use client"

import * as React from "react"
import { IconCheck, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { submitLeaderApproval } from "../actions"

type Props = {
  token: string
  volunteerName: string
  scope: string
  committee: string
  preferredRole: string
  notes: string | null
  alreadyResolved: boolean
  resolvedStatus?: string
}

export function ApprovalClient({
  token,
  volunteerName,
  scope,
  committee,
  preferredRole,
  notes,
  alreadyResolved,
  resolvedStatus,
}: Props) {
  const [leaderNotes, setLeaderNotes] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState("")
  const [done, setDone] = React.useState(false)
  const [decision, setDecision] = React.useState<"approve" | "reject" | null>(null)

  async function handleDecision(d: "approve" | "reject") {
    setError("")
    setSubmitting(true)
    setDecision(d)
    const result = await submitLeaderApproval(token, d, leaderNotes)
    setSubmitting(false)
    if (result.success) {
      setDone(true)
    } else {
      setError(result.error)
    }
  }

  if (alreadyResolved) {
    return (
      <div className="text-center space-y-3">
        <p className="font-medium">This application has already been reviewed.</p>
        <p className="text-sm text-muted-foreground">
          Current status:{" "}
          <span className="font-medium text-foreground">{resolvedStatus}</span>
        </p>
      </div>
    )
  }

  if (done) {
    const approved = decision === "approve"
    return (
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div
            className={`rounded-full p-3 ${
              approved ? "bg-green-100" : "bg-red-100"
            }`}
          >
            {approved ? (
              <IconCheck className="size-6 text-green-600" />
            ) : (
              <IconX className="size-6 text-red-600" />
            )}
          </div>
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">
            {approved ? "Application approved" : "Application rejected"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Your response has been recorded. Thank you.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Volunteer details */}
      <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Volunteer Application
        </p>
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">Name</span>
          <span className="font-medium">{volunteerName}</span>
          <span className="text-muted-foreground">Serving in</span>
          <span>{scope}</span>
          <span className="text-muted-foreground">Committee</span>
          <span>{committee}</span>
          <span className="text-muted-foreground">Preferred role</span>
          <span>{preferredRole}</span>
          {notes && (
            <>
              <span className="text-muted-foreground">Notes</span>
              <span>{notes}</span>
            </>
          )}
        </div>
      </div>

      {/* Leader notes */}
      <div className="space-y-2">
        <Label htmlFor="leaderNotes">Your notes (optional)</Label>
        <Textarea
          id="leaderNotes"
          value={leaderNotes}
          onChange={(e) => setLeaderNotes(e.target.value)}
          placeholder="Any comments on this volunteer application…"
          rows={3}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Decision buttons */}
      <div className="flex gap-3">
        <Button
          className="flex-1"
          onClick={() => handleDecision("approve")}
          disabled={submitting}
        >
          <IconCheck className="mr-2 size-4" />
          {submitting && decision === "approve" ? "Approving…" : "Approve"}
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          onClick={() => handleDecision("reject")}
          disabled={submitting}
        >
          <IconX className="mr-2 size-4" />
          {submitting && decision === "reject" ? "Rejecting…" : "Reject"}
        </Button>
      </div>
    </div>
  )
}
