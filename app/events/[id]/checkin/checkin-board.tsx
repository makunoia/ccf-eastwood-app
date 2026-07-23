"use client"

import * as React from "react"
import Link from "next/link"
import { IconCheck, IconLoader2, IconUserQuestion, IconArrowLeft } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScheduleInput } from "@/components/ui/schedule-input"
import { Label } from "@/components/ui/label"
import { PhonePHInput } from "@/components/ui/phone-ph-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  lookupCheckinRegistrant,
  searchCheckinByName,
  markCheckinAttendance,
  checkInToOccurrence,
} from "@/app/(dashboard)/events/actions"
import { autoAssignRegistrantToBreakout } from "@/app/(dashboard)/events/breakout-actions"
import {
  saveGuestMatchingProfile,
  saveGuestClaimedGroup,
  searchMembersForLeaderLookup,
  type GuestMatchingProfileInput,
} from "@/app/(dashboard)/guests/actions"
import { LANGUAGE_OPTIONS, CITY_OPTIONS } from "@/lib/constants/group-options"

type LifeStage = { id: string; name: string }
type LeaderResult = { id: string; firstName: string; lastName: string; ledGroups: { id: string; name: string }[] }

type GuestSmallGroupPrompt = {
  guestId: string
  existingProfile: {
    lifeStageId: string | null
    gender: "Male" | "Female" | null
    language: string[]
    meetingPreference: "Online" | "Hybrid" | "InPerson" | null
    workCity: string | null
    scheduleDayOfWeek: number | null
    scheduleTimeStart: string | null
    scheduleTimeEnd: string | null
  }
}

type Step =
  | "lookup"
  | "confirm"
  | "disambiguate"
  | "already-in"
  | "success"
  | "not-found-prompt"
  | "sg-prompt"
  | "sg-profile"
  | "sg-leader-search"

type CheckinSubjectKind = "registrant" | "volunteer"

type DisambiguateCandidate = {
  kind: CheckinSubjectKind
  subjectId: string
  name: string
  nickname: string | null
  alreadyCheckedIn: boolean
  contactHint: string | null
  guestSmallGroupPrompt: GuestSmallGroupPrompt | null
}

type CheckinRegistrantResult = DisambiguateCandidate

type MatchedState = {
  kind: CheckinSubjectKind
  subjectId: string
  name: string
  nickname: string | null
  guestSmallGroupPrompt: GuestSmallGroupPrompt | null
}

type Props = {
  eventId: string
  occurrenceId: string | null
  lifeStages?: LifeStage[]
  defaultLifeStageId?: string
  autoAssignBreakout?: boolean
}

const AUTO_RESET_MS = 4000

export function CheckinBoard({ eventId, occurrenceId, lifeStages = [], defaultLifeStageId = "", autoAssignBreakout = false }: Props) {
  const [step, setStep] = React.useState<Step>("lookup")
  const [query, setQuery] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [matched, setMatched] = React.useState<MatchedState | null>(null)
  const [disambiguateCandidates, setDisambiguateCandidates] = React.useState<DisambiguateCandidate[]>([])
  const [nameQuery, setNameQuery] = React.useState("")
  const [nameResults, setNameResults] = React.useState<CheckinRegistrantResult[]>([])
  const [nameSearchLoading, setNameSearchLoading] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const phoneLookupRef = React.useRef<HTMLDivElement>(null)
  const resetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const nameDebounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  function focusLookupInput() {
    setTimeout(() => {
      inputRef.current?.focus()
    }, 50)
  }

  function reset() {
    if (resetTimer.current) clearTimeout(resetTimer.current)
    if (nameDebounceTimer.current) clearTimeout(nameDebounceTimer.current)
    setStep("lookup")
    setQuery("")
    setError(null)
    setMatched(null)
    setDisambiguateCandidates([])
    setNameResults([])
    setNameQuery("")
    setLoading(false)
    focusLookupInput()
  }

  function scheduleReset() {
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(reset, AUTO_RESET_MS)
  }

  React.useEffect(() => {
    inputRef.current?.focus()
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
      if (nameDebounceTimer.current) clearTimeout(nameDebounceTimer.current)
    }
  }, [])

  // Debounced name search — fires 300ms after the last keystroke
  function handleNameQueryChange(value: string) {
    setNameQuery(value)
    setError(null)
    if (nameDebounceTimer.current) clearTimeout(nameDebounceTimer.current)
    if (value.trim().length < 2) {
      setNameResults([])
      setNameSearchLoading(false)
      return
    }
    setNameSearchLoading(true)
    nameDebounceTimer.current = setTimeout(async () => {
      const result = await searchCheckinByName(eventId, value, occurrenceId)
      setNameSearchLoading(false)
      if (result.success) {
        setNameResults(result.data)
      }
    }, 300)
  }

  function handleCandidateSelect(c: CheckinRegistrantResult) {
    setMatched({
      kind: c.kind,
      subjectId: c.subjectId,
      name: c.name,
      nickname: c.nickname,
      guestSmallGroupPrompt: c.guestSmallGroupPrompt,
    })
    if (c.alreadyCheckedIn) {
      setStep("already-in")
      scheduleReset()
    } else {
      setStep("confirm")
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (!query.trim()) { setLoading(false); return }
    const result = await lookupCheckinRegistrant(eventId, query, occurrenceId)
    setLoading(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    if (!result.data) {
      setStep("not-found-prompt")
      return
    }

    if ("matchType" in result.data && result.data.matchType === "ambiguous") {
      setDisambiguateCandidates(result.data.candidates)
      setStep("disambiguate")
      return
    }

    const checkinResult = result.data as CheckinRegistrantResult
    handleCandidateSelect(checkinResult)
  }

  async function handleConfirm() {
    if (!matched) return
    setLoading(true)

    const subject = { kind: matched.kind, id: matched.subjectId }
    const result =
      occurrenceId !== null
        ? await checkInToOccurrence(occurrenceId, subject)
        : await markCheckinAttendance(subject)

    setLoading(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    // Silently auto-assign to best breakout group in the background — only when
    // the event opts in to auto-assignment. Otherwise the registrant either picked
    // a group at registration or stays unassigned by choice. Volunteers are not
    // breakout participants, so they are never auto-assigned.
    if (occurrenceId !== null && autoAssignBreakout && matched.kind === "registrant") {
      void autoAssignRegistrantToBreakout(matched.subjectId, eventId)
    }

    // If this guest should be asked about a small group, show prompt first
    if (matched.guestSmallGroupPrompt !== null) {
      setStep("sg-prompt")
      // No auto-reset here — the timer only starts when we reach "success"
    } else {
      setStep("success")
      scheduleReset()
    }
  }

  function goToSuccess() {
    setStep("success")
    scheduleReset()
  }

  // Walk-ins go to the real registration page in check-in mode rather than an
  // embedded copy of the form — one form, one set of rules, no drift. It
  // registers + checks in on submit and links back here when done.
  const walkInHref = `/events/${eventId}/register?checkin=${occurrenceId ?? "1"}${
    query.trim() ? `&mobile=${encodeURIComponent(query.trim())}` : ""
  }`

  // ── Lookup ───────────────────────────────────────────────────────────────
  if (step === "lookup") {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full space-y-6">
          {/* Name search */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="checkin-name">Search by name</Label>
              <Input
                id="checkin-name"
                ref={inputRef}
                value={nameQuery}
                onChange={(e) => handleNameQueryChange(e.target.value)}
                placeholder="e.g. Juan dela Cruz"
                autoComplete="off"
              />
            </div>

            {nameSearchLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <IconLoader2 className="size-4 animate-spin" />
                Searching…
              </div>
            )}

            {!nameSearchLoading && nameResults.length > 0 && (
              <div className="flex flex-col gap-2">
                {nameResults.map((c) => (
                  <button
                    key={`${c.kind}-${c.subjectId}`}
                    type="button"
                    onClick={() => handleCandidateSelect(c)}
                    className="w-full rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-muted"
                  >
                    <p className="font-medium">
                      {c.name}
                      {c.nickname && (
                        <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                          ({c.nickname})
                        </span>
                      )}
                      {c.alreadyCheckedIn && (
                        <span className="ml-2 text-xs font-normal text-green-600">✓ checked in</span>
                      )}
                    </p>
                    {c.contactHint && (
                      <p className="text-sm text-muted-foreground">{c.contactHint}</p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {!nameSearchLoading && nameQuery.trim().length >= 2 && nameResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center">
                No results for &ldquo;{nameQuery.trim()}&rdquo;. Try your mobile number below, or{" "}
                <Link
                  href={walkInHref}
                  className="underline decoration-dashed underline-offset-2 hover:text-foreground transition-colors"
                >
                  register as a walk-in
                </Link>
                .
              </p>
            )}
          </div>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 border-t" />
            <span className="text-xs text-muted-foreground">or look up by</span>
            <div className="flex-1 border-t" />
          </div>

          {/* Mobile / Email lookup */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="checkin-query">Mobile number</Label>
              <div ref={phoneLookupRef}>
                <PhonePHInput
                  id="checkin-query"
                  value={query}
                  onChange={(v) => {
                    setQuery(v)
                    setError(null)
                  }}
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              className="w-full"
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

            <p className="text-center text-sm text-muted-foreground">
              Can&apos;t find yourself?{" "}
              <Link
                href={walkInHref}
                className="underline decoration-dashed underline-offset-2 hover:text-foreground transition-colors"
              >
                Register as a walk-in
              </Link>
            </p>
          </form>
        </div>
      </div>
    )
  }

  // `query` holds the mobile/email value for the disambiguate step copy
  const lookupLabel = query

  // ── Disambiguate ─────────────────────────────────────────────────────────
  if (step === "disambiguate") {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full space-y-6">
          <div className="space-y-1 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">Multiple profiles found</h2>
            <p className="text-sm text-muted-foreground">
              We found multiple registrations matching{" "}
              <span className="font-medium">{lookupLabel}</span>. Select the one that&apos;s you.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {disambiguateCandidates.map((c) => (
              <button
                key={`${c.kind}-${c.subjectId}`}
                type="button"
                onClick={() => {
                  setMatched({
                    kind: c.kind,
                    subjectId: c.subjectId,
                    name: c.name,
                    nickname: c.nickname,
                    guestSmallGroupPrompt: c.guestSmallGroupPrompt,
                  })
                  if (c.alreadyCheckedIn) {
                    setStep("already-in")
                    scheduleReset()
                  } else {
                    setStep("confirm")
                  }
                }}
                className="w-full rounded-xl border bg-background px-6 py-4 text-left transition-colors hover:bg-muted/50"
              >
                <p className="text-lg font-semibold">{c.name}</p>
                {c.nickname && (
                  <p className="mt-0.5 text-sm text-muted-foreground">&ldquo;{c.nickname}&rdquo;</p>
                )}
                {c.contactHint && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{c.contactHint}</p>
                )}
              </button>
            ))}
            <Button variant="ghost" className="w-full" onClick={reset}>
              That&apos;s not me
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Confirm ──────────────────────────────────────────────────────────────
  if (step === "confirm" && matched) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full space-y-8">
          <div className="space-y-3 text-center">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Is this you?</p>
            <div>
              <p className="text-3xl font-bold tracking-tight">{matched.name}</p>
              {matched.nickname && (
                <p className="mt-1 text-sm text-muted-foreground">&ldquo;{matched.nickname}&rdquo;</p>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          <div className="flex flex-col gap-3">
            <Button
              className="w-full"
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
              className="w-full"
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

  // ── Small Group Prompt ────────────────────────────────────────────────────
  if (step === "sg-prompt" && matched) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full space-y-6">
          <div className="space-y-1 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">One quick question</h2>
            <p className="text-sm text-muted-foreground">
              Are you interested in joining a DGroup?
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              className="w-full"
              onClick={() => setStep("sg-profile")}
            >
              Yes, I&apos;m interested
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setStep("sg-leader-search")}
            >
              I&apos;m already in one
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={goToSuccess}
            >
              Not right now
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Small Group Profile Form ──────────────────────────────────────────────
  if (step === "sg-profile" && matched?.guestSmallGroupPrompt) {
    return (
      <ProfileForm
        guestId={matched.guestSmallGroupPrompt.guestId}
        existingProfile={matched.guestSmallGroupPrompt.existingProfile}
        lifeStages={lifeStages}
        defaultLifeStageId={defaultLifeStageId}
        onSave={goToSuccess}
        onSkip={goToSuccess}
        onBack={() => setStep("sg-prompt")}
      />
    )
  }

  // ── Small Group Leader Search ─────────────────────────────────────────────
  if (step === "sg-leader-search" && matched?.guestSmallGroupPrompt) {
    return (
      <LeaderSearch
        guestId={matched.guestSmallGroupPrompt.guestId}
        onSave={goToSuccess}
        onBack={() => setStep("sg-prompt")}
      />
    )
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (step === "success" && matched) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full space-y-6 text-center">
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
      <div className="flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full space-y-6 text-center">
          <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-green-100">
            <IconCheck className="size-10 text-green-600" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Already checked in</h2>
            <p className="text-sm text-muted-foreground">
              {matched.name} is already checked in for this session.
            </p>
          </div>
          <Button variant="outline" className="w-full" onClick={reset}>
            Done
          </Button>
        </div>
      </div>
    )
  }

  // ── Not found ────────────────────────────────────────────────────────────
  if (step === "not-found-prompt") {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full space-y-6 text-center">
          <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-muted">
            <IconUserQuestion className="size-10 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Not found</h2>
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t find a registration for{" "}
              <span className="font-medium">{lookupLabel}</span>.
              You can register now or try a different lookup.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button className="w-full" asChild>
              <Link href={walkInHref}>Register now</Link>
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={reset}
            >
              Try again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

// ── Profile Form Sub-component ────────────────────────────────────────────────

type ProfileFormProps = {
  guestId: string
  existingProfile: GuestSmallGroupPrompt["existingProfile"]
  lifeStages: LifeStage[]
  defaultLifeStageId?: string
  onSave: () => void
  onSkip: () => void
  onBack: () => void
}

function ProfileForm({ guestId, existingProfile, lifeStages, defaultLifeStageId = "", onSave, onSkip, onBack }: ProfileFormProps) {
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [form, setForm] = React.useState({
    lifeStageId: existingProfile.lifeStageId ?? defaultLifeStageId,
    gender: existingProfile.gender ?? "",
    language: existingProfile.language,
    meetingPreference: existingProfile.meetingPreference ?? "",
    workCity: existingProfile.workCity ?? "",
    scheduleDayOfWeek: existingProfile.scheduleDayOfWeek != null ? String(existingProfile.scheduleDayOfWeek) : "",
    scheduleTimeStart: existingProfile.scheduleTimeStart ?? "",
    scheduleTimeEnd: existingProfile.scheduleTimeEnd ?? "",
  })

  function toggleLanguage(lang: string) {
    setForm((prev) => ({
      ...prev,
      language: prev.language.includes(lang)
        ? prev.language.filter((l) => l !== lang)
        : [...prev.language, lang],
    }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const data: GuestMatchingProfileInput = {
      lifeStageId: form.lifeStageId || null,
      gender: (form.gender || null) as "Male" | "Female" | null,
      language: form.language,
      meetingPreference: (form.meetingPreference || null) as "Online" | "Hybrid" | "InPerson" | null,
      workCity: form.workCity || null,
      scheduleDayOfWeek: form.scheduleDayOfWeek !== "" ? parseInt(form.scheduleDayOfWeek, 10) : null,
      scheduleTimeStart: form.scheduleTimeStart || null,
      scheduleTimeEnd: form.scheduleTimeEnd || null,
    }
    const result = await saveGuestMatchingProfile(guestId, data)
    setSaving(false)
    if (result.success) {
      onSave()
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="flex flex-col px-6 py-8">
      <div className="w-full space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Tell us about yourself</h2>
          <p className="text-sm text-muted-foreground">
            This helps us find the right DGroup for you.
          </p>
        </div>

        <div className="space-y-5">
          {/* Life Stage */}
          {lifeStages.length > 0 && (
            <div className="space-y-2">
              <Label>Life Stage</Label>
              <Select
                value={form.lifeStageId}
                onValueChange={(v) => setForm((p) => ({ ...p, lifeStageId: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select life stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No preference</SelectItem>
                  {lifeStages.map((ls) => (
                    <SelectItem key={ls.id} value={ls.id}>{ls.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Gender */}
          <div className="space-y-2">
            <Label>Gender</Label>
            <div className="flex gap-3">
              {["Male", "Female"].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, gender: p.gender === g ? "" : g }))}
                  className={`flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                    form.gender === g
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div className="space-y-2">
            <Label>Language</Label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleLanguage(opt.value)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    form.language.includes(opt.value)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Meeting Preference */}
          <div className="space-y-2">
            <Label>How do you prefer to meet?</Label>
            <div className="flex gap-2">
              {[
                { value: "InPerson", label: "In Person" },
                { value: "Online", label: "Online" },
                { value: "Hybrid", label: "Hybrid" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, meetingPreference: p.meetingPreference === opt.value ? "" : opt.value }))}
                  className={`flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                    form.meetingPreference === opt.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <Label>Best time to meet</Label>
            <ScheduleInput
              allowAny
              dayOfWeek={form.scheduleDayOfWeek}
              timeStart={form.scheduleTimeStart}
              timeEnd={form.scheduleTimeEnd}
              onDayChange={(v) => setForm((p) => ({ ...p, scheduleDayOfWeek: v }))}
              onTimeStartChange={(v) => setForm((p) => ({ ...p, scheduleTimeStart: v }))}
              onTimeEndChange={(v) => setForm((p) => ({ ...p, scheduleTimeEnd: v }))}
            />
          </div>

          {/* City */}
          <div className="space-y-2">
            <Label>Work city</Label>
            <Select
              value={form.workCity}
              onValueChange={(v) => setForm((p) => ({ ...p, workCity: v === "_none" ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select city" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">No preference</SelectItem>
                {CITY_OPTIONS.map((city) => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-col gap-3 pt-2">
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? <><IconLoader2 className="mr-2 size-4 animate-spin" />Saving…</> : "Save & Done"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onSkip} disabled={saving}>
            Skip for now
          </Button>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" /> Back
        </button>
      </div>
    </div>
  )
}

// ── Leader Search Sub-component ───────────────────────────────────────────────

type LeaderSearchProps = {
  guestId: string
  onSave: () => void
  onBack: () => void
}

function LeaderSearch({ guestId, onSave, onBack }: LeaderSearchProps) {
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<LeaderResult[]>([])
  const [searching, setSearching] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleQueryChange(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (value.trim().length < 2) {
        setResults([])
        return
      }
      setSearching(true)
      const res = await searchMembersForLeaderLookup(value.trim())
      setSearching(false)
      if (res.success) {
        setResults(res.data)
      }
    }, 300)
  }

  async function handleSelectGroup(smallGroupId: string) {
    setSaving(true)
    setError(null)
    const res = await saveGuestClaimedGroup(guestId, smallGroupId)
    setSaving(false)
    if (res.success) {
      onSave()
    } else {
      setError(res.error)
    }
  }

  React.useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  return (
    <div className="flex flex-col px-6 py-8">
      <div className="w-full space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Find your leader</h2>
          <p className="text-sm text-muted-foreground">
            Search by your DGroup leader&apos;s name.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="leader-search">Leader&apos;s name</Label>
          <Input
            id="leader-search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="e.g. Juan dela Cruz"
            autoComplete="off"
          />
        </div>

        {searching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" />
            Searching…
          </div>
        )}

        {!searching && results.length > 0 && (
          <div className="space-y-2">
            {results.map((member) =>
              member.ledGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  disabled={saving}
                  onClick={() => handleSelectGroup(group.id)}
                  className="w-full rounded-lg border bg-background px-4 py-3 text-left hover:bg-muted disabled:opacity-50"
                >
                  <p className="text-sm font-medium">{group.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Led by {member.firstName} {member.lastName}
                  </p>
                </button>
              ))
            )}
          </div>
        )}

        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No leaders found for &ldquo;{query}&rdquo;.
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" /> Back
        </button>
      </div>
    </div>
  )
}
