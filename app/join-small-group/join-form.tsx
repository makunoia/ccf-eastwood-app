"use client"

import * as React from "react"
import { IconCheck } from "@tabler/icons-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { ScheduleInput } from "@/components/ui/schedule-input"
import { OptionalEmailInput } from "@/components/ui/optional-email-input"
import { PhonePHInput } from "@/components/ui/phone-ph-input"
import { YearInput } from "@/components/ui/year-input"
import { PrivacyPolicyCheckbox } from "@/components/ui/privacy-policy-checkbox"
import { LANGUAGE_OPTIONS, DAYS_OF_WEEK } from "@/lib/constants/group-options"
import { buildFitReasons } from "@/components/small-group-match-card"
import {
  submitJoinForm,
  requestToJoinGroup,
  cancelAndRequestGroup,
  type PersonalInfoValues,
  type MatchingPrefsValues,
  type JoinMatchResult,
} from "./actions"

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTIONS = [
  { key: "personal", title: "Personal Information" },
  { key: "prefs", title: "Matching Preferences" },
  { key: "results", title: "Your Matches" },
] as const

type Step = (typeof SECTIONS)[number]["key"]

// ─── Types ────────────────────────────────────────────────────────────────────

type LifeStage = { id: string; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(t: string | null): string {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`
}

function formatDay(d: number | null): string {
  if (d == null) return ""
  return DAYS_OF_WEEK[d]?.label ?? ""
}

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultCard({
  result,
  selected,
  onSelect,
}: {
  result: JoinMatchResult
  selected: boolean
  onSelect: () => void
}) {
  const [detailsOpen, setDetailsOpen] = React.useState(false)
  const { strengths, considerations } = buildFitReasons(result)

  const scheduleText = result.scheduleTimeStart
    ? `${formatDay(result.scheduleDayOfWeek)}s · ${formatTime(result.scheduleTimeStart)}${
        result.scheduleTimeEnd ? ` – ${formatTime(result.scheduleTimeEnd)}` : ""
      }`
    : null

  const score = Math.round(result.totalScore * 100)

  return (
    <>
      <div
        className={cn(
          "cursor-pointer rounded-lg border p-4 transition-colors",
          selected ? "border-foreground bg-foreground/5" : "border-border bg-card hover:bg-muted/50"
        )}
        onClick={onSelect}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium leading-snug truncate">{result.groupName}</p>
            <p className="text-sm text-muted-foreground">
              {result.leaderFirstName} {result.leaderLastName}
            </p>
            {scheduleText && (
              <p className="text-sm text-muted-foreground">{scheduleText}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <p className="text-sm text-muted-foreground whitespace-nowrap">{score}% match</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation()
                setDetailsOpen(true)
              }}
            >
              Why?
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{result.groupName}</DialogTitle>
            <DialogDescription>
              {score === 100 ? "Perfect fit based on your profile" : `${score}% overall match`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {strengths.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Why this group fits you
                </p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {strengths.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              </div>
            )}
            {considerations.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Worth considering
                </p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {considerations.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              </div>
            )}
            {strengths.length === 0 && considerations.length === 0 && (
              <p className="text-sm text-muted-foreground">
                We matched you on the details you shared — add more to your profile
                for an even better fit.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function JoinForm({ lifeStages }: { lifeStages: LifeStage[] }) {
  const [step, setStep] = React.useState<Step>("personal")

  const [personal, setPersonal] = React.useState<PersonalInfoValues>({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    gender: "",
    lifeStageId: "",
    birthMonth: "",
    birthYear: "",
  })

  const [prefs, setPrefs] = React.useState<MatchingPrefsValues>({
    language: [],
    meetingPreference: "",
    scheduleDayOfWeek: "",
    scheduleTimeStart: "",
    scheduleTimeEnd: "",
  })

  const [results, setResults] = React.useState<JoinMatchResult[]>([])
  const [guestId, setGuestId] = React.useState<string | null>(null)
  const [selectedGroupId, setSelectedGroupId] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [requesting, setRequesting] = React.useState(false)
  const [isDone, setIsDone] = React.useState(false)
  const [noEmail, setNoEmail] = React.useState(false)
  const [privacyAccepted, setPrivacyAccepted] = React.useState(false)

  const [pendingConflict, setPendingConflict] = React.useState<{
    existingRequestId: string
    existingGroupId: string
    existingGroupName: string
    newGroupId: string
  } | null>(null)

  function setPref(key: keyof MatchingPrefsValues, value: string | string[]) {
    setPrefs((prev) => ({ ...prev, [key]: value }))
  }

  const stepIndex = SECTIONS.findIndex((s) => s.key === step) + 1

  function handlePersonalNext() {
    if (!privacyAccepted) return toast.error("Please agree to the CCF Privacy Policy to continue")
    if (!personal.firstName.trim()) return toast.error("First name is required")
    if (!personal.lastName.trim()) return toast.error("Last name is required")
    if (!personal.phone.trim()) return toast.error("Mobile number is required")
    if (!personal.gender) return toast.error("Gender is required")
    if (!personal.lifeStageId) return toast.error("Life stage is required")
    if (!personal.birthMonth || !personal.birthYear) return toast.error("Birthday is required")
    setStep("prefs")
  }

  async function handlePrefsNext() {
    setSubmitting(true)
    const result = await submitJoinForm(personal, prefs)
    setSubmitting(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    setGuestId(result.data.guestId)
    setResults(result.data.results)
    setStep("results")
  }

  async function handleRequest() {
    if (!guestId || !selectedGroupId) return
    setRequesting(true)
    const result = await requestToJoinGroup(guestId, selectedGroupId)
    setRequesting(false)

    if ("hasPendingRequest" in result) {
      setPendingConflict({
        existingRequestId: result.existingRequestId,
        existingGroupId: result.existingGroupId,
        existingGroupName: result.existingGroupName,
        newGroupId: selectedGroupId,
      })
      return
    }

    if (!result.success) {
      toast.error(result.error)
      return
    }

    setIsDone(true)
  }

  async function handleConflictConfirm() {
    if (!guestId || !pendingConflict) return
    setRequesting(true)
    const result = await cancelAndRequestGroup(
      guestId,
      pendingConflict.existingRequestId,
      pendingConflict.newGroupId
    )
    setRequesting(false)
    setPendingConflict(null)

    if (!result.success) {
      toast.error("error" in result ? result.error : "Something went wrong")
      return
    }

    setIsDone(true)
  }

  if (isDone) {
    const joinedGroup = results.find((r) => r.groupId === selectedGroupId)
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 pt-10 pb-8 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-green-100">
            <IconCheck className="size-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold">Request Sent!</h2>
          {joinedGroup && (
            <p className="text-sm text-muted-foreground">
              Your request to join <strong>{joinedGroup.groupName}</strong> has been sent. The group
              leader will be in touch soon.
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="pt-0">
        {/* Step indicator — matches event registration form style */}
        <div className="px-6 pt-4 pb-1">
          <div className="flex items-center gap-1.5 mb-4">
            {SECTIONS.map((s, i) => {
              const n = i + 1
              const isPast = n < stepIndex
              const isCurrent = n === stepIndex
              return (
                <React.Fragment key={s.key}>
                  <div
                    className={cn(
                      "rounded-full shrink-0 transition-all duration-150",
                      isPast
                        ? "size-2 bg-primary/50"
                        : isCurrent
                          ? "size-2.5 bg-primary"
                          : "size-2 bg-muted-foreground/25"
                    )}
                  />
                  {i < SECTIONS.length - 1 && (
                    <div
                      className={cn(
                        "flex-1 h-px transition-colors",
                        isPast ? "bg-primary/40" : "bg-border"
                      )}
                    />
                  )}
                </React.Fragment>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">Step {stepIndex} of {SECTIONS.length}</p>
          <p className="text-lg font-semibold mt-0.5">{SECTIONS[stepIndex - 1].title}</p>
        </div>

        <CardContent className="pt-4">
          {/* ── Step 1: Personal Info ───────────────────────────────────────── */}
          {step === "personal" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="firstName">
                    First Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    value={personal.firstName}
                    onChange={(e) => setPersonal((p) => ({ ...p, firstName: e.target.value }))}
                    placeholder="Juan"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lastName">
                    Last Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    value={personal.lastName}
                    onChange={(e) => setPersonal((p) => ({ ...p, lastName: e.target.value }))}
                    placeholder="dela Cruz"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">
                  Mobile Number <span className="text-destructive">*</span>
                </Label>
                <PhonePHInput
                  value={personal.phone}
                  onChange={(v) => setPersonal((p) => ({ ...p, phone: v }))}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email Address</Label>
                <OptionalEmailInput
                  id="email"
                  value={personal.email ?? ""}
                  onChange={(e) => setPersonal((p) => ({ ...p, email: e.target.value }))}
                  placeholder="juan@email.com"
                  noEmail={noEmail}
                  onNoEmailChange={(checked) => {
                    setNoEmail(checked)
                    if (checked) setPersonal((p) => ({ ...p, email: "" }))
                  }}
                  checkboxLabel="I don't have an email"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Gender <span className="text-destructive">*</span></Label>
                <div className="flex gap-3">
                  {(["Male", "Female"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() =>
                        setPersonal((p) => ({ ...p, gender: p.gender === g ? "" : g }))
                      }
                      className={cn(
                        "flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors",
                        personal.gender === g
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted"
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Life Stage <span className="text-destructive">*</span></Label>
                <Select
                  value={personal.lifeStageId}
                  onValueChange={(v) => setPersonal((p) => ({ ...p, lifeStageId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {lifeStages.map((ls) => (
                      <SelectItem key={ls.id} value={ls.id}>
                        {ls.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Birthday <span className="text-destructive">*</span></Label>
                <div className="flex gap-2">
                  <Select
                    value={personal.birthMonth || "_none"}
                    onValueChange={(v) =>
                      setPersonal((p) => ({ ...p, birthMonth: v === "_none" ? "" : v }))
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Month</SelectItem>
                      {[
                        "January", "February", "March", "April",
                        "May", "June", "July", "August",
                        "September", "October", "November", "December",
                      ].map((name, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <YearInput
                    value={personal.birthYear ?? ""}
                    onChange={(v) => setPersonal((p) => ({ ...p, birthYear: v }))}
                    className="w-24"
                  />
                </div>
              </div>

              <PrivacyPolicyCheckbox
                checked={privacyAccepted}
                onCheckedChange={setPrivacyAccepted}
              />

              <Button onClick={handlePersonalNext} className="w-full">
                Next
              </Button>
            </div>
          )}

          {/* ── Step 2: Matching Preferences ─────────────────────────────────── */}
          {step === "prefs" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                These help us find the best group for you. Fill in as many as you can.
              </p>

              {/* Schedule */}
              <div className="flex flex-col gap-1.5">
                <Label>
                  Best Time to Meet <span className="text-destructive">*</span>
                </Label>
                <ScheduleInput
                  dayOfWeek={prefs.scheduleDayOfWeek ?? ""}
                  timeStart={prefs.scheduleTimeStart ?? ""}
                  timeEnd={prefs.scheduleTimeEnd ?? ""}
                  onDayChange={(v) => setPref("scheduleDayOfWeek", v)}
                  onTimeStartChange={(v) => setPref("scheduleTimeStart", v)}
                  onTimeEndChange={(v) => setPref("scheduleTimeEnd", v)}
                />
              </div>

              {/* Language */}
              <div className="flex flex-col gap-1.5">
                <Label>
                  Language <span className="text-destructive">*</span>
                </Label>
                <MultiSelect
                  options={LANGUAGE_OPTIONS}
                  value={prefs.language}
                  onChange={(v) => setPref("language", v)}
                  placeholder="Select"
                />
              </div>

              {/* Meeting Preference */}
              <div className="flex flex-col gap-1.5">
                <Label>
                  Meeting Preference <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={prefs.meetingPreference || "_none"}
                  onValueChange={(v) => setPref("meetingPreference", v === "_none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No preference</SelectItem>
                    <SelectItem value="InPerson">In Person</SelectItem>
                    <SelectItem value="Online">Online</SelectItem>
                    <SelectItem value="Hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("personal")}>
                  Back
                </Button>
                <Button className="flex-1" onClick={handlePrefsNext} disabled={submitting}>
                  {submitting ? "Finding matches…" : "Find Matches"}
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Results ──────────────────────────────────────────────── */}
          {step === "results" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {results.length > 0
                  ? "Select a group and tap Request to Join."
                  : "No groups matched your preferences right now. Check back soon!"}
              </p>

              {results.length > 0 && (
                <>
                  <div className="flex flex-col gap-3">
                    {results.map((r) => (
                      <ResultCard
                        key={r.groupId}
                        result={r}
                        selected={selectedGroupId === r.groupId}
                        onSelect={() => setSelectedGroupId(r.groupId)}
                      />
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setStep("prefs")}>
                      Back
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={!selectedGroupId || requesting}
                      onClick={handleRequest}
                    >
                      {requesting ? "Sending…" : "Request to Join"}
                    </Button>
                  </div>
                </>
              )}

              {results.length === 0 && (
                <Button variant="outline" onClick={() => setStep("prefs")}>
                  Adjust Preferences
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Duplicate request confirmation dialog */}
      <AlertDialog
        open={pendingConflict != null}
        onOpenChange={(open) => { if (!open) setPendingConflict(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You already have a pending request</AlertDialogTitle>
            <AlertDialogDescription>
              You have a pending request to join{" "}
              <strong>{pendingConflict?.existingGroupName}</strong>. Would you like to cancel that
              request and request to join{" "}
              <strong>
                {results.find((r) => r.groupId === pendingConflict?.newGroupId)?.groupName}
              </strong>{" "}
              instead?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep existing request</AlertDialogCancel>
            <AlertDialogAction onClick={handleConflictConfirm} disabled={requesting}>
              {requesting ? "Switching…" : "Yes, switch group"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
