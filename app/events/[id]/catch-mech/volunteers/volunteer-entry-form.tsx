"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PhonePHInput } from "@/components/ui/phone-ph-input"
import { Button } from "@/components/ui/button"
import { verifyCatchMechVolunteer } from "./actions"
import { verifyCatchMechFaci } from "../actions"
import { callAction, SUBMIT_NETWORK_ERROR } from "@/lib/forms/call-action"

export function VolunteerEntryForm({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [mobile, setMobile] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState("")
  // Set when the person turns out to facilitate a table. Kept in state rather
  // than redirecting instantly so they are told WHY they moved forms — a silent
  // teleport to a different questionnaire reads as a bug.
  const [redirect, setRedirect] = React.useState<{ token: string; groupName: string } | null>(null)
  const [choices, setChoices] = React.useState<{ id: string; name: string }[] | null>(null)

  async function handleContinue() {
    if (!mobile.trim()) {
      setError("Please enter your mobile number")
      return
    }

    setError("")
    setSubmitting(true)
    const result = await callAction(
      () => verifyCatchMechVolunteer(eventId, mobile),
      "verifyCatchMechVolunteer"
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

    const entry = result.data
    if (entry.kind === "volunteer") {
      router.push(`/events/${eventId}/catch-mech/volunteers/${entry.token}`)
      return
    }
    if (entry.kind === "facilitator") {
      setRedirect({ token: entry.token, groupName: entry.groupName })
      return
    }
    setChoices(entry.groups)
  }

  async function handleGroupChoice(breakoutGroupId: string) {
    setError("")
    setSubmitting(true)
    const result = await callAction(
      () => verifyCatchMechFaci(eventId, breakoutGroupId, mobile),
      "verifyCatchMechFaci"
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
    router.push(`/events/${eventId}/catch-mech/${result.data.token}`)
  }

  if (redirect) {
    return (
      <div className="space-y-4 text-center">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">You&apos;re facilitating {redirect.groupName}</h1>
          <p className="text-sm text-muted-foreground">
            Facilitators answer for their whole table, not just the people they
            personally absorbed — so this one form covers everything.
          </p>
        </div>
        <Button
          className="w-full"
          onClick={() => router.push(`/events/${eventId}/catch-mech/${redirect.token}`)}
        >
          Continue to the facilitator form
        </Button>
      </div>
    )
  }

  if (choices) {
    return (
      <div className="space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">Which group are you answering for?</h1>
          <p className="text-sm text-muted-foreground">
            You facilitate more than one table. Facilitators answer for their whole
            table, so pick the one you&apos;re reporting on.
          </p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="space-y-2">
          {choices.map((group) => (
            <Button
              key={group.id}
              variant="outline"
              className="w-full justify-start"
              disabled={submitting}
              onClick={() => handleGroupChoice(group.id)}
            >
              {group.name}
            </Button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Back to the shared entry point — the role question lives there, so a
          facilitator who answered "No" by mistake needs a way to correct it. */}
      <Link
        href={`/events/${eventId}/catch-mech`}
        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back
      </Link>
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">Volunteer follow-up</h1>
        <p className="text-sm text-muted-foreground">
          Let us know which event participants have joined your DGroup.
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="mobile" className="text-sm font-medium">
          Mobile number
        </label>
        <PhonePHInput
          id="mobile"
          value={mobile}
          onChange={setMobile}
          onKeyDown={(event) => event.key === "Enter" && handleContinue()}
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" onClick={handleContinue} disabled={submitting}>
        {submitting ? "Verifying..." : "Continue"}
      </Button>
    </div>
  )
}
