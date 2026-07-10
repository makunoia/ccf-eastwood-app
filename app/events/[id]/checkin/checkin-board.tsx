"use client"

import * as React from "react"
import { IconCheck, IconLoader2, IconUserQuestion, IconArrowLeft } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScheduleInput } from "@/components/ui/schedule-input"
import { YearInput } from "@/components/ui/year-input"
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
  lookupCheckinRegistrantByProfile,
  markCheckinAttendance,
  checkInToOccurrence,
} from "@/app/(dashboard)/events/actions"
import { RegistrationForm, type WalkInSuccess } from "../register/registration-form"
import { autoAssignRegistrantToBreakout } from "@/app/(dashboard)/events/breakout-actions"
import {
  saveGuestMatchingProfile,
  saveGuestClaimedGroup,
  searchMembersForLeaderLookup,
  type GuestMatchingProfileInput,
} from "@/app/(dashboard)/guests/actions"
import { LANGUAGE_OPTIONS, CITY_OPTIONS } from "@/lib/constants/group-options"
import { type BreakoutCandidate } from "@/lib/breakout-suggestion"

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

type LookupMode = "mobile" | "email" | "name-dob"

type Step =
  | "lookup"
  | "confirm"
  | "disambiguate"
  | "already-in"
  | "success"
  | "not-found-prompt"
  | "walk-in"
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
  guestSmallGroupPrompt: GuestSmallGroupPrompt | null
}

type CheckinRegistrantResult = DisambiguateCandidate

type MatchedState = {
  kind: CheckinSubjectKind
  subjectId: string
  name: string
  nickname: string | null
  guestSmallGroupPrompt: GuestSmallGroupPrompt | null
  breakoutGroup?: { id: string; name: string } | null
}

type Props = {
  eventId: string
  occurrenceId: string | null
  eventName?: string
  includeSmallGroup?: boolean
  includeDietary?: boolean
  lifeStages?: LifeStage[]
  defaultLifeStageId?: string
  autoAssignBreakout?: boolean
  breakoutCandidates?: BreakoutCandidate[]
  allowPayment?: boolean
}

const AUTO_RESET_MS = 4000

function queryIsPhone(q: string): boolean {
  return !q.includes("@")
}

export function CheckinBoard({ eventId, occurrenceId, eventName = "", includeSmallGroup = false, includeDietary = false, lifeStages = [], defaultLifeStageId = "", autoAssignBreakout = false, breakoutCandidates = [], allowPayment = false }: Props) {
  const [step, setStep] = React.useState<Step>("lookup")
  const [lookupMode, setLookupMode] = React.useState<LookupMode>("mobile")
  const [query, setQuery] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [matched, setMatched] = React.useState<MatchedState | null>(null)
  const [disambiguateCandidates, setDisambiguateCandidates] = React.useState<DisambiguateCandidate[]>([])
  const [nameDobForm, setNameDobForm] = React.useState({
    lastName: "",
    birthMonth: "",
    birthYear: "",
  })
  const inputRef = React.useRef<HTMLInputElement>(null)
  const phoneLookupRef = React.useRef<HTMLDivElement>(null)
  const resetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  function focusLookupInput() {
    setTimeout(() => {
      if (lookupMode === "email") {
        inputRef.current?.focus()
      } else {
        phoneLookupRef.current?.querySelector<HTMLInputElement>("input")?.focus()
      }
    }, 50)
  }

  function reset() {
    if (resetTimer.current) clearTimeout(resetTimer.current)
    setStep("lookup")
    setQuery("")
    setError(null)
    setMatched(null)
    setDisambiguateCandidates([])
    setNameDobForm({ lastName: "", birthMonth: "", birthYear: "" })
    setLoading(false)
    focusLookupInput()
  }

  function scheduleReset() {
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(reset, AUTO_RESET_MS)
  }

  React.useEffect(() => {
    phoneLookupRef.current?.querySelector<HTMLInputElement>("input")?.focus()
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    let result: Awaited<ReturnType<typeof lookupCheckinRegistrant>>
    if (lookupMode === "name-dob") {
      if (!nameDobForm.lastName.trim() || !nameDobForm.birthMonth || !nameDobForm.birthYear) {
        setLoading(false)
        return
      }
      result = await lookupCheckinRegistrantByProfile(
        eventId,
        nameDobForm.lastName,
        parseInt(nameDobForm.birthMonth, 10),
        parseInt(nameDobForm.birthYear, 10),
        occurrenceId
      )
    } else {
      if (!query.trim()) { setLoading(false); return }
      result = await lookupCheckinRegistrant(eventId, query, occurrenceId)
    }
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
    setMatched({
      kind: checkinResult.kind,
      subjectId: checkinResult.subjectId,
      name: checkinResult.name,
      nickname: checkinResult.nickname,
      guestSmallGroupPrompt: checkinResult.guestSmallGroupPrompt,
    })

    if (checkinResult.alreadyCheckedIn) {
      setStep("already-in")
      scheduleReset()
    } else {
      setStep("confirm")
    }
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

  // Walk-in registration is handled by the shared RegistrationForm (same steps
  // as public registration); it registers + checks in via createRegistrant's
  // walk-in mode, then hands control back here for the success screen.
  function handleWalkInSuccess(result: WalkInSuccess) {
    setMatched({
      kind: "registrant",
      subjectId: result.registrantId,
      name: result.name,
      nickname: result.nickname,
      guestSmallGroupPrompt: null,
      breakoutGroup: result.breakoutGroup,
    })
    setStep("success")
    scheduleReset()
  }

  // ── Lookup ───────────────────────────────────────────────────────────────
  if (step === "lookup") {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full space-y-6">
          <p className="text-sm text-muted-foreground text-center">
            How would you like to look up your registration?
          </p>

          <div className="space-y-2">
            <div className="flex overflow-hidden rounded-lg border">
              {(["mobile", "email"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    if (lookupMode !== mode) {
                      setLookupMode(mode)
                      setQuery("")
                      setError(null)
                    }
                  }}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    lookupMode === mode
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  {mode === "mobile" ? "Mobile Number" : "Email"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                if (lookupMode !== "name-dob") {
                  setLookupMode("name-dob")
                  setQuery("")
                  setError(null)
                }
              }}
              className={`w-full rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                lookupMode === "name-dob"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              }`}
            >
              I don&apos;t have either
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {lookupMode === "mobile" && (
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
            )}

            {lookupMode === "email" && (
              <div className="space-y-2">
                <Label htmlFor="checkin-query">Email address</Label>
                <Input
                  id="checkin-query"
                  ref={inputRef}
                  type="email"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setError(null)
                  }}
                  placeholder="juan@email.com"
                  autoComplete="email"
                />
              </div>
            )}

            {lookupMode === "name-dob" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="namedob-lastname">Last name</Label>
                  <Input
                    id="namedob-lastname"
                    value={nameDobForm.lastName}
                    onChange={(e) => {
                      setNameDobForm((p) => ({ ...p, lastName: e.target.value }))
                      setError(null)
                    }}
                    placeholder="dela Cruz"
                    autoComplete="family-name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="namedob-month">Birth month</Label>
                    <Select
                      value={nameDobForm.birthMonth}
                      onValueChange={(v) => setNameDobForm((p) => ({ ...p, birthMonth: v }))}
                    >
                      <SelectTrigger id="namedob-month">
                        <SelectValue placeholder="Month" />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          "January", "February", "March", "April",
                          "May", "June", "July", "August",
                          "September", "October", "November", "December",
                        ].map((month, i) => (
                          <SelectItem key={month} value={String(i + 1)}>{month}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="namedob-year">Birth year</Label>
                    <YearInput
                      id="namedob-year"
                      value={nameDobForm.birthYear}
                      onChange={(v) => setNameDobForm((p) => ({ ...p, birthYear: v }))}
                    />
                  </div>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              className="w-full"
              disabled={
                loading ||
                (lookupMode !== "name-dob" && !query.trim()) ||
                (lookupMode === "name-dob" && (!nameDobForm.lastName.trim() || !nameDobForm.birthMonth || !nameDobForm.birthYear))
              }
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

  // ── Disambiguate ─────────────────────────────────────────────────────────
  if (step === "disambiguate") {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-8">
        <div className="w-full space-y-6">
          <div className="space-y-1 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">Multiple profiles found</h2>
            <p className="text-sm text-muted-foreground">
              We found multiple registrations matching{" "}
              <span className="font-medium">{query}</span>. Select the one that&apos;s you.
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
              Are you interested in joining a Small Group?
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
          {matched.breakoutGroup && (
            <div className="rounded-xl border bg-muted/40 px-6 py-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Your breakout group</p>
              <p className="mt-1 text-base font-medium">{matched.breakoutGroup.name}</p>
            </div>
          )}
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
              <span className="font-medium">{query}</span>.
              You can register now or try a different lookup.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button
              className="w-full"
              onClick={() => setStep("walk-in")}
            >
              Register now
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

  // ── Walk-in registration (shared with public registration) ───────────────
  if (step === "walk-in") {
    return (
      <div className="px-6">
        <RegistrationForm
          eventId={eventId}
          eventName={eventName}
          includeSmallGroup={includeSmallGroup}
          includeDietary={includeDietary}
          includePayment={allowPayment}
          lifeStages={lifeStages}
          defaultLifeStageId={defaultLifeStageId}
          breakoutCandidates={breakoutCandidates}
          frame="plain"
          walkIn={{
            occurrenceId,
            prefill:
              lookupMode === "name-dob"
                ? {
                    lastName: nameDobForm.lastName,
                    birthMonth: nameDobForm.birthMonth,
                    birthYear: nameDobForm.birthYear,
                  }
                : queryIsPhone(query)
                  ? { mobileNumber: query }
                  : { email: query },
            onSuccess: handleWalkInSuccess,
            onBack: () => {
              setError(null)
              setStep("not-found-prompt")
            },
          }}
        />
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
            This helps us find the right Small Group for you.
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
            Search by your Small Group leader&apos;s name.
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
