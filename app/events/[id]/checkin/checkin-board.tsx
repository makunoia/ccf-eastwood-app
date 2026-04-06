"use client"

import * as React from "react"
import { IconCheck, IconLoader2, IconUserQuestion } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  lookupCheckinRegistrant,
  markCheckinAttendance,
  checkInToOccurrence,
} from "@/app/(dashboard)/events/actions"

type Step = "lookup" | "confirm" | "already-in" | "success" | "not-found"

type Props = {
  eventId: string
  occurrenceId: string | null
}

const AUTO_RESET_MS = 4000

export function CheckinBoard({ eventId, occurrenceId }: Props) {
  const [step, setStep] = React.useState<Step>("lookup")
  const [query, setQuery] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [matched, setMatched] = React.useState<{
    registrantId: string
    name: string
    nickname: string | null
  } | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const resetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  function reset() {
    if (resetTimer.current) clearTimeout(resetTimer.current)
    setStep("lookup")
    setQuery("")
    setError(null)
    setMatched(null)
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function scheduleReset() {
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(reset, AUTO_RESET_MS)
  }

  React.useEffect(() => {
    inputRef.current?.focus()
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setError(null)
    setLoading(true)

    const result = await lookupCheckinRegistrant(eventId, query, occurrenceId)
    setLoading(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    if (!result.data) {
      setStep("not-found")
      scheduleReset()
      return
    }

    setMatched({
      registrantId: result.data.registrantId,
      name: result.data.name,
      nickname: result.data.nickname,
    })

    if (result.data.alreadyCheckedIn) {
      setStep("already-in")
      scheduleReset()
    } else {
      setStep("confirm")
    }
  }

  async function handleConfirm() {
    if (!matched) return
    setLoading(true)

    const result =
      occurrenceId !== null
        ? await checkInToOccurrence(occurrenceId, matched.registrantId)
        : await markCheckinAttendance(matched.registrantId)

    setLoading(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    setStep("success")
    scheduleReset()
  }

  // ── Lookup ───────────────────────────────────────────────────────────────
  if (step === "lookup") {
    return (
      <div className="flex min-h-[70svh] flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">Check in</h2>
            <p className="text-sm text-muted-foreground">
              Enter your email address or mobile number
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="checkin-query">Email or mobile number</Label>
              <Input
                id="checkin-query"
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setError(null)
                }}
                placeholder="juan@email.com or +63 917 123 4567"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="h-12 text-base"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <Button
              type="submit"
              className="h-12 w-full text-base"
              disabled={loading || !query.trim()}
            >
              {loading ? (
                <>
                  <IconLoader2 className="mr-2 size-4 animate-spin" />
                  Looking up…
                </>
              ) : (
                "Find my registration"
              )}
            </Button>
          </form>
        </div>
      </div>
    )
  }

  // ── Confirm ──────────────────────────────────────────────────────────────
  if (step === "confirm" && matched) {
    return (
      <div className="flex min-h-[70svh] flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">Is this you?</h2>
            <p className="text-sm text-muted-foreground">
              Confirm your details to check in
            </p>
          </div>

          <div className="rounded-xl border bg-muted/40 px-6 py-5 text-center">
            <p className="text-xl font-semibold">{matched.name}</p>
            {matched.nickname && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                &ldquo;{matched.nickname}&rdquo;
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          <div className="flex flex-col gap-3">
            <Button
              className="h-12 w-full text-base"
              onClick={handleConfirm}
              disabled={loading}
            >
              {loading ? (
                <>
                  <IconLoader2 className="mr-2 size-4 animate-spin" />
                  Checking in…
                </>
              ) : (
                "Yes, check me in"
              )}
            </Button>
            <Button
              variant="ghost"
              className="h-11 w-full"
              onClick={reset}
              disabled={loading}
            >
              That&apos;s not me
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (step === "success" && matched) {
    return (
      <div className="flex min-h-[70svh] flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-green-100">
            <IconCheck className="size-10 text-green-600" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">
              Welcome, {matched.nickname ?? matched.name.split(" ")[0]}!
            </h2>
            <p className="text-sm text-muted-foreground">You&apos;re checked in.</p>
          </div>
          <p className="text-xs text-muted-foreground">Returning to start in a moment…</p>
        </div>
      </div>
    )
  }

  // ── Already checked in ───────────────────────────────────────────────────
  if (step === "already-in" && matched) {
    return (
      <div className="flex min-h-[70svh] flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-green-100">
            <IconCheck className="size-10 text-green-600" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Already checked in</h2>
            <p className="text-sm text-muted-foreground">
              {matched.name} is already checked in for this session.
            </p>
          </div>
          <Button variant="outline" className="h-11 w-full" onClick={reset}>
            Done
          </Button>
        </div>
      </div>
    )
  }

  // ── Not found ────────────────────────────────────────────────────────────
  if (step === "not-found") {
    return (
      <div className="flex min-h-[70svh] flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-muted">
            <IconUserQuestion className="size-10 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Not found</h2>
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t find a registration for{" "}
              <span className="font-medium">{query}</span>.
              <br />
              Double-check your email or mobile number, or ask the event team for help.
            </p>
          </div>
          <Button className="h-12 w-full text-base" onClick={reset}>
            Try again
          </Button>
        </div>
      </div>
    )
  }

  return null
}
