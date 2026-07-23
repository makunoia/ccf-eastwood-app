"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PhonePHInput } from "@/components/ui/phone-ph-input"
import { Button } from "@/components/ui/button"
import { verifyCatchMechVolunteer } from "./actions"

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
    const result = await verifyCatchMechVolunteer(eventId, mobile)
    setSubmitting(false)

    if (result.success) {
      router.push(`/events/${eventId}/catch-mech/volunteers/${result.data.token}`)
      return
    }
    setError(result.error)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">Volunteer follow-up</h1>
        <p className="text-sm text-muted-foreground">
          Let us know which event participants have joined your small group.
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
