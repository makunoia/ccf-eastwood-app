"use client"

import * as React from "react"
import { IconCheck, IconHeart } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { lookupMemberByMobile, submitVolunteerSignUp } from "./sign-up-actions"

type CommitteeRole = { id: string; name: string }
type Committee = { id: string; name: string; roles: CommitteeRole[] }

type Props = {
  contextName: string       // e.g. "Elevate Ministry" or "Camp 2025"
  ministryId?: string
  eventId?: string
  committees: Committee[]
}

type Step = "lookup" | "confirm" | "form" | "success"

type FoundMember = {
  id: string
  firstName: string
  lastName: string
  email: string | null
}

export function VolunteerSignUpForm({ contextName, ministryId, eventId, committees }: Props) {
  const [step, setStep] = React.useState<Step>("lookup")

  // Step 1 — mobile lookup
  const [mobile, setMobile] = React.useState("")
  const [looking, setLooking] = React.useState(false)
  const [lookupError, setLookupError] = React.useState("")
  const [foundMember, setFoundMember] = React.useState<FoundMember | null>(null)

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault()
    setLookupError("")
    setLooking(true)
    const member = await lookupMemberByMobile(mobile)
    setLooking(false)
    if (!member) {
      setLookupError(
        "No member found with that mobile number. You must be a registered church member to volunteer. Please contact the church office."
      )
      return
    }
    setFoundMember(member)
    setStep("confirm")
  }

  // Step 2 — confirm identity
  function handleConfirmYes() {
    setStep("form")
  }

  function handleNotMe() {
    setFoundMember(null)
    setMobile("")
    setLookupError("")
    setStep("lookup")
  }

  // Step 3 — sign-up form
  const [committeeId, setCommitteeId] = React.useState("")
  const [preferredRoleId, setPreferredRoleId] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState("")

  const selectedCommittee = committees.find((c) => c.id === committeeId)
  const committeeRoles = selectedCommittee?.roles ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!foundMember) return
    setSubmitError("")
    setSubmitting(true)
    const result = await submitVolunteerSignUp({
      memberId: foundMember.id,
      ministryId,
      eventId,
      committeeId,
      preferredRoleId,
      notes,
    })
    setSubmitting(false)
    if (result.success) {
      setStep("success")
    } else {
      setSubmitError(result.error)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-3">
              <IconHeart className="size-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold">Volunteer Sign-Up</h1>
          <p className="text-sm text-muted-foreground">{contextName}</p>
        </div>

        {/* Step 1: Mobile lookup */}
        {step === "lookup" && (
          <form onSubmit={handleLookup} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="mobile">Your mobile number</Label>
              <Input
                id="mobile"
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="+63 9XX XXX XXXX"
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                We use this to find your member record.
              </p>
            </div>

            {lookupError && (
              <p className="text-sm text-destructive">{lookupError}</p>
            )}

            <Button type="submit" className="w-full" disabled={looking || !mobile.trim()}>
              {looking ? "Looking up…" : "Continue"}
            </Button>
          </form>
        )}

        {/* Step 2: Confirm identity */}
        {step === "confirm" && foundMember && (
          <div className="space-y-6">
            <div className="rounded-lg border bg-muted/50 p-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                We found this record
              </p>
              <p className="text-lg font-semibold">
                {foundMember.firstName} {foundMember.lastName}
              </p>
              {foundMember.email && (
                <p className="text-sm text-muted-foreground">{foundMember.email}</p>
              )}
            </div>

            <p className="text-sm">Is this you?</p>

            <div className="flex gap-3">
              <Button onClick={handleConfirmYes} className="flex-1">
                Yes, that&apos;s me
              </Button>
              <Button variant="outline" onClick={handleNotMe} className="flex-1">
                Not me
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Sign-up form */}
        {step === "form" && foundMember && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Signing up as{" "}
              <span className="font-medium text-foreground">
                {foundMember.firstName} {foundMember.lastName}
              </span>
            </p>

            {committees.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No committees are set up for this{" "}
                  {ministryId ? "ministry" : "event"} yet. Please check back
                  later or contact the church office.
                </p>
              </div>
            ) : (
              <>
                {/* Committee */}
                <div className="space-y-2">
                  <Label htmlFor="committee">
                    Committee <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={committeeId}
                    onValueChange={(v) => {
                      setCommitteeId(v)
                      setPreferredRoleId("")
                    }}
                  >
                    <SelectTrigger id="committee">
                      <SelectValue placeholder="Select a committee" />
                    </SelectTrigger>
                    <SelectContent>
                      {committees.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Preferred role */}
                {committeeId && (
                  <div className="space-y-2">
                    <Label htmlFor="role">
                      Preferred Role <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={preferredRoleId}
                      onValueChange={setPreferredRoleId}
                    >
                      <SelectTrigger id="role">
                        <SelectValue placeholder="Select your preferred role" />
                      </SelectTrigger>
                      <SelectContent>
                        {committeeRoles.length === 0 ? (
                          <SelectItem value="none" disabled>
                            No roles available
                          </SelectItem>
                        ) : (
                          committeeRoles.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Anything you'd like us to know…"
                    rows={3}
                  />
                </div>

                {submitError && (
                  <p className="text-sm text-destructive">{submitError}</p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || !committeeId || !preferredRoleId}
                >
                  {submitting ? "Submitting…" : "Submit application"}
                </Button>
              </>
            )}
          </form>
        )}

        {/* Step 4: Success */}
        {step === "success" && (
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 p-3">
                <IconCheck className="size-6 text-green-600" />
              </div>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Application submitted!</h2>
              <p className="text-sm text-muted-foreground">
                Your volunteer application has been received. The church admin
                will follow up with you.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
