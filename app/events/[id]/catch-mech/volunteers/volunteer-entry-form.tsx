"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PhonePHInput } from "@/components/ui/phone-ph-input"
import { Button } from "@/components/ui/button"
import { verifyCatchMechVolunteer } from "./actions"
import { callAction, SUBMIT_NETWORK_ERROR } from "@/lib/forms/call-action"

export function VolunteerEntryForm({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [mobile, setMobile] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState("")

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
    if (result.success) {
      router.push(`/events/${eventId}/catch-mech/volunteers/${result.data.token}`)
      return
    }
    setError(result.error)
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
