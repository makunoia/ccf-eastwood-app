"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PhonePHInput } from "@/components/ui/phone-ph-input"
import { verifyCatchMechFaci } from "./actions"

type Group = { id: string; name: string }

type Props = {
  eventId: string
  groups: Group[]
}

export function CatchMechEntryForm({ eventId, groups }: Props) {
  const router = useRouter()
  const [step, setStep] = React.useState<"group" | "mobile">("group")
  const [selectedGroupId, setSelectedGroupId] = React.useState("")
  const [mobile, setMobile] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState("")

  const selectedGroup = groups.find((g) => g.id === selectedGroupId)

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
    const result = await verifyCatchMechFaci(eventId, selectedGroupId, mobile)
    setSubmitting(false)
    if (result.success) {
      router.push(`/events/${eventId}/catch-mech/${result.data.token}`)
    } else {
      setError(result.error)
    }
  }

  if (step === "group") {
    return (
      <div className="space-y-3">
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
