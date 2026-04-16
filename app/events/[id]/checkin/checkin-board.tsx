"use client"

import * as React from "react"
import { IconCheck, IconLoader2, IconUserQuestion, IconArrowLeft } from "@tabler/icons-react"

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
import {
  lookupCheckinRegistrant,
  markCheckinAttendance,
  checkInToOccurrence,
} from "@/app/(dashboard)/events/actions"
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
  | "already-in"
  | "success"
  | "not-found"
  | "sg-prompt"
  | "sg-profile"
  | "sg-leader-search"

type MatchedState = {
  registrantId: string
  name: string
  nickname: string | null
  guestSmallGroupPrompt: GuestSmallGroupPrompt | null
}

type Props = {
  eventId: string
  occurrenceId: string | null
  lifeStages?: LifeStage[]
}

const AUTO_RESET_MS = 4000

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

export function CheckinBoard({ eventId, occurrenceId, lifeStages = [] }: Props) {
  const [step, setStep] = React.useState<Step>("lookup")
  const [query, setQuery] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [matched, setMatched] = React.useState<MatchedState | null>(null)
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
      guestSmallGroupPrompt: result.data.guestSmallGroupPrompt,
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

  // ── Small Group Prompt ────────────────────────────────────────────────────
  if (step === "sg-prompt" && matched) {
    return (
      <div className="flex min-h-[70svh] flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">One quick question</h2>
            <p className="text-sm text-muted-foreground">
              Are you interested in joining a Small Group?
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              className="h-12 w-full text-base"
              onClick={() => setStep("sg-profile")}
            >
              Yes, I&apos;m interested
            </Button>
            <Button
              variant="outline"
              className="h-12 w-full text-base"
              onClick={() => setStep("sg-leader-search")}
            >
              I&apos;m already in one
            </Button>
            <Button
              variant="ghost"
              className="h-11 w-full"
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

// ── Profile Form Sub-component ────────────────────────────────────────────────

type ProfileFormProps = {
  guestId: string
  existingProfile: GuestSmallGroupPrompt["existingProfile"]
  lifeStages: LifeStage[]
  onSave: () => void
  onSkip: () => void
  onBack: () => void
}

function ProfileForm({ guestId, existingProfile, lifeStages, onSave, onSkip, onBack }: ProfileFormProps) {
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [form, setForm] = React.useState({
    lifeStageId: existingProfile.lifeStageId ?? "",
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
    <div className="flex min-h-[70svh] flex-col px-6 py-8">
      <div className="mx-auto w-full max-w-sm space-y-6">
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
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={form.scheduleDayOfWeek}
                onValueChange={(v) => setForm((p) => ({ ...p, scheduleDayOfWeek: v === "none" ? "" : v }))}
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Day" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any day</SelectItem>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="time"
                value={form.scheduleTimeStart}
                onChange={(e) => setForm((p) => ({ ...p, scheduleTimeStart: e.target.value }))}
                className="w-28"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="time"
                value={form.scheduleTimeEnd}
                onChange={(e) => setForm((p) => ({ ...p, scheduleTimeEnd: e.target.value }))}
                className="w-28"
              />
            </div>
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
          <Button className="h-12 w-full text-base" onClick={handleSave} disabled={saving}>
            {saving ? <><IconLoader2 className="mr-2 size-4 animate-spin" />Saving…</> : "Save & Done"}
          </Button>
          <Button variant="ghost" className="h-11 w-full" onClick={onSkip} disabled={saving}>
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
    <div className="flex min-h-[70svh] flex-col px-6 py-8">
      <div className="mx-auto w-full max-w-sm space-y-6">
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
            className="h-12 text-base"
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
