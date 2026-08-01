"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PhonePHInput } from "@/components/ui/phone-ph-input"
import { verifyCatchMechFaci } from "./actions"
import { callAction, SUBMIT_NETWORK_ERROR } from "@/lib/forms/call-action"

type Group = { id: string; name: string }

type Props = {
  eventId: string
  groups: Group[]
}

/**
 * The single public entry point for Catch Mech.
 *
 * Facilitators and event volunteers answer different forms but were being sent
 * two different links, which meant whoever shared them had to know which person
 * got which. The role question up front makes one link correct for everyone:
 * facilitators continue here, volunteers are routed to the follow-up form.
 */
export function CatchMechEntryForm({ eventId, groups }: Props) {
  const router = useRouter()
  const [step, setStep] = React.useState<"role" | "group" | "mobile">("role")
  const [selectedGroupId, setSelectedGroupId] = React.useState("")
  const [mobile, setMobile] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [routing, setRouting] = React.useState(false)
  const [error, setError] = React.useState("")

  const volunteerPath = `/events/${eventId}/catch-mech/volunteers`
  const selectedGroup = groups.find((g) => g.id === selectedGroupId)

  // The volunteer form is one tap away for roughly half of everyone who lands
  // here, so it is worth having in the router cache before that tap.
  React.useEffect(() => {
    router.prefetch(volunteerPath)
  }, [router, volunteerPath])

  function handleGroupSelect(groupId: string) {
    setSelectedGroupId(groupId)
    setError("")
    setStep("mobile")
  }

  async function handleVerify() {
    if (!mobile.trim()) {
      setError("Please enter your mobile number")
      return
    }
    setError("")
    setSubmitting(true)
    const result = await callAction(
      () => verifyCatchMechFaci(eventId, selectedGroupId, mobile),
      "verifyCatchMechFaci"
    )
    setSubmitting(false)
    if (!result) {
      setError(SUBMIT_NETWORK_ERROR)
    } else if (result.success) {
      router.push(`/events/${eventId}/catch-mech/${result.data.token}`)
    } else {
      setError(result.error)
    }
  }

  if (step === "role") {
    return (
      <div className="space-y-4">
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium">Are you a facilitator?</p>
          <p className="text-xs text-muted-foreground">
            Facilitators confirm the people at their table. Everyone else tells us who
            joined their DGroup.
          </p>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setError("")
              setStep("group")
            }}
            className="w-full rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/50"
          >
            <span className="block text-sm font-medium">Yes, I facilitated a table</span>
            <span className="block text-xs text-muted-foreground">
              Confirm who from your breakout group is joining a DGroup
            </span>
          </button>
          <button
            type="button"
            disabled={routing}
            onClick={() => {
              setRouting(true)
              router.push(volunteerPath)
            }}
            className="w-full rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
          >
            <span className="block text-sm font-medium">
              {routing ? "Opening…" : "No, I'm an event volunteer"}
            </span>
            <span className="block text-xs text-muted-foreground">
              Report the participants who joined your DGroup
            </span>
          </button>
        </div>
      </div>
    )
  }

  if (step === "group") {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => { setStep("role"); setError("") }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back
        </button>
        <p className="text-sm font-medium text-center">Select your table</p>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No breakout groups with facilitators set up yet.
          </p>
        ) : (
          <div className="divide-y border rounded-lg overflow-hidden">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => handleGroupSelect(g.id)}
                className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => { setStep("group"); setMobile(""); setError("") }}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        ← {selectedGroup?.name}
      </button>

      <div className="space-y-2">
        <label htmlFor="mobile" className="text-sm font-medium">
          Enter your mobile number
        </label>
        <PhonePHInput
          id="mobile"
          value={mobile}
          onChange={setMobile}
          onKeyDown={(e) => e.key === "Enter" && handleVerify()}
          autoFocus
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="button"
        onClick={handleVerify}
        disabled={submitting}
        className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {submitting ? "Verifying…" : "Continue"}
      </button>
    </div>
  )
}
