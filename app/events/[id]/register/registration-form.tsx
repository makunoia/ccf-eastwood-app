"use client"

import * as React from "react"
import { IconCheck } from "@tabler/icons-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { TimeInput } from "@/components/ui/time-input"
import { Label } from "@/components/ui/label"
import { MultiSelect } from "@/components/ui/multi-select"
import { OptionalEmailInput } from "@/components/ui/optional-email-input"
import { OptionalPhonePHInput } from "@/components/ui/optional-phone-ph-input"
import { YearInput } from "@/components/ui/year-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createRegistrant,
  lookupMemberForRegistration,
} from "@/app/(dashboard)/events/actions"
import { LANGUAGE_OPTIONS, CITY_OPTIONS } from "@/lib/constants/group-options"
import {
  suggestBreakoutGroup,
  filterCompatibleCandidates,
  type BreakoutCandidate,
} from "@/lib/breakout-suggestion"

type AssignedBreakout = {
  id: string
  name: string
  meetingFormat: "Online" | "Hybrid" | "InPerson" | null
  locationCity: string | null
  schedule: { dayOfWeek: number; timeStart: string } | null
}

const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"]
const MEETING_FORMAT_LABEL: Record<"Online" | "Hybrid" | "InPerson", string> = {
  Online: "Online",
  Hybrid: "Hybrid",
  InPerson: "In Person",
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return time
  const period = h >= 12 ? "PM" : "AM"
  const display = h % 12 || 12
  return `${display}:${m.toString().padStart(2, "0")} ${period}`
}

type Step = "form" | "confirm" | "disambiguate" | "early-confirm" | "early-disambiguate" | "done"

type LifeStage = { id: string; name: string }

type DietaryValue =
  | ""
  | "Vegetarian"
  | "Vegan"
  | "Halal"
  | "Kosher"
  | "GlutenFree"
  | "DairyFree"
  | "NutFree"
  | "Pescatarian"
  | "Other"

type FormValues = {
  firstName: string
  lastName: string
  nickname: string
  email: string
  mobileNumber: string
  birthMonth: string
  birthYear: string
  lifeStageId: string
  gender: string
  language: string[]
  meetingPreference: string
  workCity: string
  scheduleDayOfWeek: string
  scheduleTimeStart: string
  dietaryPreference: DietaryValue
  dietaryOther: string
  paymentReference: string
}

type MatchedMember = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  matchedBy: "mobile" | "email" | "nameBirthday"
  recordType: "member" | "guest"
  // Member-only extended fields (present when recordType === "member" and early lookup was used)
  smallGroupId?: string | null
  groupStatus?: string | null
  lifeStageId?: string | null
  language?: string[]
  meetingPreference?: string | null
  workCity?: string | null
  schedulePreferences?: { dayOfWeek: number; timeStart: string }[]
}

type AmbiguousCandidate = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  recordType: "member" | "guest"
  smallGroupId?: string | null
  groupStatus?: string | null
  lifeStageId?: string | null
  language?: string[]
  meetingPreference?: string | null
  workCity?: string | null
  schedulePreferences?: { dayOfWeek: number; timeStart: string }[]
}

const defaultForm: FormValues = {
  firstName: "",
  lastName: "",
  nickname: "",
  email: "",
  mobileNumber: "",
  birthMonth: "",
  birthYear: "",
  lifeStageId: "",
  gender: "",
  language: [],
  meetingPreference: "",
  workCity: "",
  scheduleDayOfWeek: "",
  scheduleTimeStart: "",
  dietaryPreference: "",
  dietaryOther: "",
  paymentReference: "",
}

const DIETARY_OPTIONS: { value: Exclude<DietaryValue, "">; label: string }[] = [
  { value: "Vegetarian", label: "Vegetarian" },
  { value: "Vegan", label: "Vegan" },
  { value: "Halal", label: "Halal" },
  { value: "Kosher", label: "Kosher" },
  { value: "GlutenFree", label: "Gluten-Free" },
  { value: "DairyFree", label: "Dairy-Free" },
  { value: "NutFree", label: "Nut-Free" },
  { value: "Pescatarian", label: "Pescatarian" },
  { value: "Other", label: "Other" },
]

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

type Props = {
  eventId: string
  eventName?: string
  includeSmallGroup?: boolean
  includeDietary?: boolean
  includePayment?: boolean
  lifeStages?: LifeStage[]
  breakoutCandidates?: BreakoutCandidate[]
}

export function RegistrationForm({
  eventId,
  eventName = "",
  includeSmallGroup = false,
  includeDietary = false,
  includePayment = false,
  lifeStages = [],
  breakoutCandidates = [],
}: Props) {
  const [step, setStep] = React.useState<Step>("form")
  const [form, setForm] = React.useState<FormValues>(defaultForm)
  const [noMobile, setNoMobile] = React.useState(false)
  const [noEmail, setNoEmail] = React.useState(false)
  const [wantsSmallGroup, setWantsSmallGroup] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [matchedMember, setMatchedMember] = React.useState<MatchedMember | null>(null)
  const [confirmedMember, setConfirmedMember] = React.useState<MatchedMember | null>(null)
  const [skipSmallGroup, setSkipSmallGroup] = React.useState(false)
  const [candidates, setCandidates] = React.useState<{
    matchedBy: "mobile" | "email"
    items: AmbiguousCandidate[]
  } | null>(null)
  const [selectedBreakoutId, setSelectedBreakoutId] = React.useState<string>("")
  const [assignedBreakout, setAssignedBreakout] = React.useState<AssignedBreakout | null>(null)
  const [formStep, setFormStep] = React.useState(1)
  const cardRef = React.useRef<HTMLDivElement>(null)

  const showBreakoutSection = breakoutCandidates.length > 0

  const suggestedBreakout = React.useMemo(() => {
    if (!showBreakoutSection) return null
    return suggestBreakoutGroup(breakoutCandidates, {
      gender: (form.gender || null) as "Male" | "Female" | null,
      birthYear: form.birthYear ? parseInt(form.birthYear, 10) : null,
    })
  }, [breakoutCandidates, form.gender, form.birthYear, showBreakoutSection])

  const browsableCandidates = React.useMemo(() => {
    return filterCompatibleCandidates(breakoutCandidates, {
      gender: (form.gender || null) as "Male" | "Female" | null,
      birthYear: form.birthYear ? parseInt(form.birthYear, 10) : null,
    })
  }, [breakoutCandidates, form.gender, form.birthYear])

  const sections: { key: string; title: string }[] = [
    { key: "personal", title: "Personal Information" },
    ...(includeSmallGroup && !skipSmallGroup ? [{ key: "smallgroup", title: "Small Group Info" }] : []),
    ...(showBreakoutSection ? [{ key: "breakout", title: "Breakout Group" }] : []),
    ...(includeDietary ? [{ key: "dietary", title: "Dietary Preferences" }] : []),
    ...(includePayment ? [{ key: "payment", title: "Payment" }] : []),
  ]
  const isMultiStep = sections.length > 1
  const currentSectionKey = sections[formStep - 1].key

  function scrollToTop() {
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function set(field: keyof FormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleNext() {
    if (formStep === 1) {
      if (!form.firstName.trim()) {
        toast.error("First name is required.")
        return
      }
      if (!form.lastName.trim()) {
        toast.error("Last name is required.")
        return
      }

      // Early member lookup before the Small Group step so we can adapt the form
      if (includeSmallGroup) {
        const hasMobile = !noMobile && !!form.mobileNumber
        const hasEmail = !noEmail && !!form.email
        const hasBirthday = !!form.birthMonth && !!form.birthYear

        if (hasMobile || hasEmail || hasBirthday) {
          setSubmitting(true)
          const match = await lookupMemberForRegistration({
            mobileNumber: hasMobile ? form.mobileNumber : null,
            email: hasEmail ? form.email : null,
            lastName: hasBirthday ? form.lastName : null,
            birthMonth: hasBirthday ? parseInt(form.birthMonth, 10) : null,
            birthYear: hasBirthday ? parseInt(form.birthYear, 10) : null,
          })
          setSubmitting(false)

          if (match) {
            if ("matchType" in match && match.matchType === "ambiguous") {
              setCandidates({ matchedBy: match.matchedBy, items: match.candidates })
              setStep("early-disambiguate")
              return
            }
            setMatchedMember(match as MatchedMember)
            setStep("early-confirm")
            return
          }
        }
      }
    }
    setFormStep((s) => s + 1)
    scrollToTop()
  }

  function handleEarlyReject() {
    setMatchedMember(null)
    setCandidates(null)
    setStep("form")
    setFormStep(2)
    scrollToTop()
  }

  function handleEarlyConfirm(match: MatchedMember) {
    setConfirmedMember(match)

    // Pre-fill matching fields from member's existing data
    if (match.recordType === "member") {
      setForm((prev) => ({
        ...prev,
        lifeStageId: match.lifeStageId || prev.lifeStageId,
        language: match.language && match.language.length > 0 ? match.language : prev.language,
        meetingPreference: match.meetingPreference || prev.meetingPreference,
        workCity: match.workCity || prev.workCity,
        scheduleDayOfWeek:
          match.schedulePreferences && match.schedulePreferences.length > 0
            ? match.schedulePreferences[0].dayOfWeek.toString()
            : prev.scheduleDayOfWeek,
        scheduleTimeStart:
          match.schedulePreferences && match.schedulePreferences.length > 0
            ? match.schedulePreferences[0].timeStart
            : prev.scheduleTimeStart,
      }))
    }

    const willSkipSmallGroup = match.recordType === "member" && !!match.smallGroupId
    if (willSkipSmallGroup) {
      setSkipSmallGroup(true)
    }

    // Auto-check "wants small group" for confirmed members who don't have one yet
    if (match.recordType === "member" && !match.smallGroupId) {
      setWantsSmallGroup(true)
    }

    setMatchedMember(null)
    setStep("form")

    // Compute the new section count to decide whether to advance or submit
    const newSectionsCount = [
      true,
      includeSmallGroup && !willSkipSmallGroup,
      showBreakoutSection,
      includeDietary,
      includePayment,
    ].filter(Boolean).length

    if (newSectionsCount === 1) {
      // Personal info is the only remaining step — register directly
      register(
        match.recordType === "member" ? match.id : null,
        match.recordType === "guest" ? match.id : null
      )
      return
    }

    setFormStep(2)
    scrollToTop()
  }

  function handleBack() {
    setFormStep((s) => s - 1)
    scrollToTop()
  }

  async function handleSubmit(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault()

    if (!isMultiStep) {
      if (!form.firstName.trim() || !form.lastName.trim()) {
        toast.error("First and last name are required.")
        return
      }
    }

    setSubmitting(true)

    // Fast-path: member was already confirmed in the early lookup step
    if (confirmedMember) {
      await register(
        confirmedMember.recordType === "member" ? confirmedMember.id : null,
        confirmedMember.recordType === "guest" ? confirmedMember.id : null
      )
      return
    }

    const hasMobile = !noMobile && !!form.mobileNumber
    const hasEmail = !noEmail && !!form.email
    const hasBirthday = !!form.birthMonth && !!form.birthYear

    if (hasMobile || hasEmail || hasBirthday) {
      const match = await lookupMemberForRegistration({
        mobileNumber: hasMobile ? form.mobileNumber : null,
        email: hasEmail ? form.email : null,
        lastName: hasBirthday ? form.lastName : null,
        birthMonth: hasBirthday ? parseInt(form.birthMonth, 10) : null,
        birthYear: hasBirthday ? parseInt(form.birthYear, 10) : null,
      })
      setSubmitting(false)
      if (match) {
        if ("matchType" in match && match.matchType === "ambiguous") {
          setCandidates({ matchedBy: match.matchedBy, items: match.candidates })
          setStep("disambiguate")
          return
        }
        setMatchedMember(match as MatchedMember)
        setStep("confirm")
        return
      }
    } else {
      setSubmitting(false)
    }

    await register(null)
  }

  async function register(
    confirmedMemberId: string | null,
    confirmedGuestId?: string | null,
    skipDeduplication?: boolean
  ) {
    setSubmitting(true)
    const includeMatching = includeSmallGroup && wantsSmallGroup
    const result = await createRegistrant(
      eventId,
      {
        firstName: form.firstName,
        lastName: form.lastName,
        nickname: form.nickname,
        email: form.email,
        mobileNumber: form.mobileNumber,
        birthMonth: form.birthMonth ? parseInt(form.birthMonth, 10) : null,
        birthYear: form.birthYear ? parseInt(form.birthYear, 10) : null,
        lifeStageId: includeMatching ? form.lifeStageId || null : null,
        gender: (form.gender || null) as "Male" | "Female" | null,
        language: includeMatching ? form.language : [],
        meetingPreference: includeMatching
          ? ((form.meetingPreference || null) as "Online" | "Hybrid" | "InPerson" | null)
          : null,
        workCity: includeMatching ? form.workCity || null : null,
        scheduleDayOfWeek:
          includeMatching && form.scheduleDayOfWeek !== ""
            ? parseInt(form.scheduleDayOfWeek, 10)
            : null,
        scheduleTimeStart: includeMatching ? form.scheduleTimeStart || null : null,
        dietaryPreference: includeDietary
          ? form.dietaryPreference === ""
            ? null
            : form.dietaryPreference
          : null,
        dietaryOther:
          includeDietary && form.dietaryPreference === "Other" ? form.dietaryOther || null : null,
        paymentReference: includePayment ? form.paymentReference || null : null,
      },
      confirmedMemberId,
      confirmedGuestId,
      skipDeduplication,
      selectedBreakoutId || null
    )
    setSubmitting(false)

    if (result.success) {
      setAssignedBreakout(result.data.breakoutGroup)
      setStep("done")
    } else {
      toast.error(result.error)
    }
  }

  if (step === "done") {
    const displayName = form.nickname.trim() || form.firstName.trim()
    const displayBreakout: AssignedBreakout | null =
      assignedBreakout ??
      (selectedBreakoutId
        ? (() => {
            const candidate = breakoutCandidates.find((c) => c.id === selectedBreakoutId)
            return candidate
              ? { id: candidate.id, name: candidate.name, meetingFormat: null, locationCity: null, schedule: null }
              : null
          })()
        : null)
    const meta = displayBreakout
      ? [
          displayBreakout.schedule
            ? `${DAY_NAMES[displayBreakout.schedule.dayOfWeek]} · ${formatTime(displayBreakout.schedule.timeStart)}`
            : null,
          displayBreakout.meetingFormat
            ? MEETING_FORMAT_LABEL[displayBreakout.meetingFormat]
            : null,
          displayBreakout.locationCity,
        ].filter(Boolean)
      : []
    const handleReset = () => {
      setStep("form")
      setForm(defaultForm)
      setNoMobile(false)
      setNoEmail(false)
      setWantsSmallGroup(false)
      setMatchedMember(null)
      setConfirmedMember(null)
      setSkipSmallGroup(false)
      setCandidates(null)
      setSelectedBreakoutId("")
      setAssignedBreakout(null)
      setFormStep(1)
    }

    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-5 pt-10 pb-6">
          <div className="flex size-16 items-center justify-center rounded-full bg-green-100">
            <IconCheck className="size-8 text-green-600" />
          </div>
          <div className="text-center space-y-1.5">
            <p className="text-xl font-semibold">
              Welcome{displayName ? `, ${displayName}` : ""}!
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {eventName
                ? `You're all set for ${eventName}. We're so glad you're coming — feel free to bring a friend!`
                : "You're all set! We're so glad you're joining us. Feel free to bring a friend — see you soon!"}
            </p>
            {displayBreakout && (
              <div className="mt-3 rounded-xl border bg-muted/40 px-4 py-3 text-left space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Your breakout group
                </p>
                <p className="text-sm font-semibold">{displayBreakout.name}</p>
                {meta.length > 0 && (
                  <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p>
                )}
              </div>
            )}
          </div>
          <Button className="w-full" onClick={handleReset}>
            Register another person
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (step === "disambiguate" && candidates) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Multiple profiles found</CardTitle>
          <CardDescription>
            {candidates.matchedBy === "mobile"
              ? "We found multiple profiles with this mobile number."
              : "We found multiple profiles with this email address."}{" "}
            Select the one that&apos;s you, or choose &quot;That&apos;s not me&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {candidates.items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setMatchedMember({ ...c, matchedBy: candidates.matchedBy })
                setStep("confirm")
              }}
              className="w-full rounded-lg border p-4 text-left text-sm transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">
                {c.firstName} {c.lastName}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({c.recordType})
                </span>
              </p>
              {c.email && <p className="text-muted-foreground">{c.email}</p>}
              {c.phone && <p className="text-muted-foreground">{c.phone}</p>}
            </button>
          ))}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => register(null)}
            disabled={submitting}
          >
            {submitting ? "Registering…" : "That's not me"}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (step === "confirm" && matchedMember) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Is this you?</CardTitle>
          <CardDescription>
            {matchedMember.matchedBy === "mobile" &&
              "We found an existing record matching your mobile number."}
            {matchedMember.matchedBy === "email" &&
              "We found an existing record matching your email address."}
            {matchedMember.matchedBy === "nameBirthday" &&
              "We found an existing record matching your name and birthday."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 text-sm space-y-1">
            <p className="font-medium">
              {matchedMember.firstName} {matchedMember.lastName}
            </p>
            {matchedMember.email && (
              <p className="text-muted-foreground">{matchedMember.email}</p>
            )}
            {matchedMember.phone && (
              <p className="text-muted-foreground">{matchedMember.phone}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() =>
                matchedMember.recordType === "guest"
                  ? register(null, matchedMember.id)
                  : register(matchedMember.id)
              }
              disabled={submitting}
            >
              {submitting ? "Registering…" : "Yes, that's me"}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() =>
                matchedMember.recordType === "guest"
                  ? register(null, null, true)
                  : register(null)
              }
              disabled={submitting}
            >
              {submitting ? "Registering…" : "That's not me"}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (step === "early-confirm" && matchedMember) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Is this you?</CardTitle>
          <CardDescription>
            {matchedMember.matchedBy === "mobile" &&
              "We found an existing record matching your mobile number."}
            {matchedMember.matchedBy === "email" &&
              "We found an existing record matching your email address."}
            {matchedMember.matchedBy === "nameBirthday" &&
              "We found an existing record matching your name and birthday."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 text-sm space-y-1">
            <p className="font-medium">
              {matchedMember.firstName} {matchedMember.lastName}
            </p>
            {matchedMember.email && (
              <p className="text-muted-foreground">{matchedMember.email}</p>
            )}
            {matchedMember.phone && (
              <p className="text-muted-foreground">{matchedMember.phone}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => handleEarlyConfirm(matchedMember)}
              disabled={submitting}
            >
              {submitting ? "Please wait…" : "Yes, that's me"}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleEarlyReject}
              disabled={submitting}
            >
              That&apos;s not me
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (step === "early-disambiguate" && candidates) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Multiple profiles found</CardTitle>
          <CardDescription>
            {candidates.matchedBy === "mobile"
              ? "We found multiple profiles with this mobile number."
              : "We found multiple profiles with this email address."}{" "}
            Select the one that&apos;s you, or choose &quot;That&apos;s not me&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {candidates.items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleEarlyConfirm({ ...c, matchedBy: candidates.matchedBy })}
              className="w-full rounded-lg border p-4 text-left text-sm transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">
                {c.firstName} {c.lastName}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({c.recordType})
                </span>
              </p>
              {c.email && <p className="text-muted-foreground">{c.email}</p>}
              {c.phone && <p className="text-muted-foreground">{c.phone}</p>}
            </button>
          ))}
          <Button
            variant="outline"
            className="w-full"
            onClick={handleEarlyReject}
            disabled={submitting}
          >
            That&apos;s not me
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card ref={cardRef} className={cn(isMultiStep && "pt-0")}>
      {isMultiStep ? (
        <div className="px-6 pt-4 pb-1">
          {/* Step dots */}
          <div className="flex items-center gap-1.5 mb-4">
            {sections.map((s, i) => {
              const n = i + 1
              const done = n < formStep
              const current = n === formStep
              return (
                <React.Fragment key={s.key}>
                  <div
                    className={cn(
                      "rounded-full shrink-0 transition-all duration-150",
                      done
                        ? "size-2 bg-primary/50"
                        : current
                          ? "size-2.5 bg-primary"
                          : "size-2 bg-muted-foreground/25"
                    )}
                  />
                  {i < sections.length - 1 && (
                    <div
                      className={cn(
                        "flex-1 h-px transition-colors",
                        done ? "bg-primary/40" : "bg-border"
                      )}
                    />
                  )}
                </React.Fragment>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Step {formStep} of {sections.length}
          </p>
          <p className="text-lg font-semibold mt-0.5">{sections[formStep - 1].title}</p>
        </div>
      ) : (
        <CardHeader>
          <CardTitle>Register</CardTitle>
          <CardDescription>Fill in your details to register for this event.</CardDescription>
        </CardHeader>
      )}

      <CardContent className={cn(isMultiStep && "pt-4")}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ── Personal Information ── */}
          {(!isMultiStep || currentSectionKey === "personal") && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">
                    First Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    value={form.firstName}
                    onChange={(e) => set("firstName", e.target.value)}
                    placeholder="Juan"
                    required={!isMultiStep}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">
                    Last Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    value={form.lastName}
                    onChange={(e) => set("lastName", e.target.value)}
                    placeholder="dela Cruz"
                    required={!isMultiStep}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nickname">Nickname</Label>
                <Input
                  id="nickname"
                  value={form.nickname}
                  onChange={(e) => set("nickname", e.target.value)}
                  placeholder="Jun"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mobileNumber">Mobile Number</Label>
                <OptionalPhonePHInput
                  id="mobileNumber"
                  value={form.mobileNumber}
                  onChange={(v) => set("mobileNumber", v)}
                  noNumber={noMobile}
                  onNoNumberChange={setNoMobile}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <OptionalEmailInput
                  id="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="juan@email.com"
                  noEmail={noEmail}
                  onNoEmailChange={setNoEmail}
                />
              </div>

              <div className="space-y-2">
                <Label>Birthday</Label>
                <div className="flex gap-2">
                  <Select
                    value={form.birthMonth}
                    onValueChange={(v) => set("birthMonth", v === "_none" ? "" : v)}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Month</SelectItem>
                      {[
                        "January",
                        "February",
                        "March",
                        "April",
                        "May",
                        "June",
                        "July",
                        "August",
                        "September",
                        "October",
                        "November",
                        "December",
                      ].map((name, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <YearInput
                    value={form.birthYear}
                    onChange={(v) => set("birthYear", v)}
                    className="w-24"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Gender</Label>
                <div className="flex gap-3">
                  {["Male", "Female"].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => set("gender", form.gender === g ? "" : g)}
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
            </>
          )}

          {/* ── Small Group Info ── */}
          {includeSmallGroup && (!isMultiStep || currentSectionKey === "smallgroup") && (
            <>
              {!isMultiStep && (
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium text-foreground">Small Group</p>
                </div>
              )}

              {confirmedMember?.recordType === "member" && !confirmedMember.smallGroupId && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
                  You&apos;re not in a Small Group yet — joining one is a great next step!
                </div>
              )}

              <div className={cn("flex items-start gap-2", !isMultiStep && "pt-1")}>
                <Checkbox
                  id="wantsSmallGroup"
                  checked={wantsSmallGroup}
                  onCheckedChange={(v) => setWantsSmallGroup(v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="wantsSmallGroup" className="text-sm font-normal leading-snug">
                  {confirmedMember?.recordType === "member" && !confirmedMember.smallGroupId
                    ? "Join a Small Group"
                    : "I want to join a Small Group"}
                </Label>
              </div>

              {wantsSmallGroup && (
                <>
                  <div className={cn(isMultiStep ? "pt-1" : "pt-2 border-t")}>
                    <p className="text-sm font-medium text-foreground">Help us connect you</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      These optional details help us find the right Breakout Group for you.
                    </p>
                  </div>

                  {lifeStages.length > 0 && (
                    <div className="space-y-2">
                      <Label>Life Stage</Label>
                      <Select
                        value={form.lifeStageId}
                        onValueChange={(v) => set("lifeStageId", v === "none" ? "" : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select life stage" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No preference</SelectItem>
                          {lifeStages.map((ls) => (
                            <SelectItem key={ls.id} value={ls.id}>
                              {ls.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Primary Language</Label>
                    <MultiSelect
                      options={LANGUAGE_OPTIONS}
                      value={form.language}
                      onChange={(v) => setForm((prev) => ({ ...prev, language: v }))}
                      placeholder="Select language(s)"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Meeting Preference</Label>
                    <Select
                      value={form.meetingPreference}
                      onValueChange={(v) => set("meetingPreference", v === "none" ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select preference" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No preference</SelectItem>
                        <SelectItem value="Online">Online</SelectItem>
                        <SelectItem value="Hybrid">Hybrid</SelectItem>
                        <SelectItem value="InPerson">In Person</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Best time to meet</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={form.scheduleDayOfWeek}
                        onValueChange={(v) => set("scheduleDayOfWeek", v === "none" ? "" : v)}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue placeholder="Day" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Any day</SelectItem>
                          {DAYS_OF_WEEK.map((d) => (
                            <SelectItem key={d.value} value={d.value}>
                              {d.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <TimeInput
                        value={form.scheduleTimeStart}
                        onChange={(v) => set("scheduleTimeStart", v)}
                        className="w-28"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Work / Home City</Label>
                    <Select
                      value={form.workCity || "_none"}
                      onValueChange={(v) => set("workCity", v === "_none" ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select city" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">No preference</SelectItem>
                        {CITY_OPTIONS.map((city) => (
                          <SelectItem key={city} value={city}>
                            {city}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Breakout Group ── */}
          {showBreakoutSection && (!isMultiStep || currentSectionKey === "breakout") && (
            <>
              {!isMultiStep && (
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium text-foreground">Breakout Group</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pick a group for the event — optional.
                  </p>
                </div>
              )}

              {isMultiStep && (
                <p className="text-sm text-muted-foreground">
                  Pick a group for the event — optional.
                </p>
              )}

              {suggestedBreakout && (() => {
                const isSelected = selectedBreakoutId === suggestedBreakout.id
                return (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`Suggested group: ${suggestedBreakout.name}`}
                    onClick={() =>
                      setSelectedBreakoutId(isSelected ? "" : suggestedBreakout.id)
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors cursor-pointer",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:bg-muted/50"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Suggested for you
                      </p>
                      <p className="mt-1 text-sm font-medium truncate">{suggestedBreakout.name}</p>
                    </div>
                    <div
                      aria-hidden="true"
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30 bg-background"
                      )}
                    >
                      {isSelected && <IconCheck className="size-3.5" />}
                    </div>
                  </button>
                )
              })()}

              <div className="space-y-2">
                <Label>Or browse all groups</Label>
                <Select
                  value={selectedBreakoutId || "_none"}
                  onValueChange={(v) => setSelectedBreakoutId(v === "_none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No selection</SelectItem>
                    {browsableCandidates.map((g) => {
                      const isFull = g.memberLimit != null && g.memberCount >= g.memberLimit
                      return (
                        <SelectItem key={g.id} value={g.id} disabled={isFull}>
                          {g.name}
                          {isFull ? " (full)" : ""}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* ── Dietary Preferences ── */}
          {includeDietary && (!isMultiStep || currentSectionKey === "dietary") && (
            <>
              {!isMultiStep && (
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium text-foreground">Dietary restrictions</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Let us know if you have any dietary preferences.
                  </p>
                </div>
              )}

              {isMultiStep && (
                <p className="text-sm text-muted-foreground">
                  Let us know if you have any dietary preferences.
                </p>
              )}

              <div className="space-y-2">
                <Label>Preference</Label>
                <Select
                  value={form.dietaryPreference || "_none"}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      dietaryPreference: (v === "_none" ? "" : v) as DietaryValue,
                      dietaryOther: v === "Other" ? prev.dietaryOther : "",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No restrictions</SelectItem>
                    {DIETARY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.dietaryPreference === "Other" && (
                <div className="space-y-2">
                  <Label htmlFor="dietaryOther">Please specify</Label>
                  <Input
                    id="dietaryOther"
                    value={form.dietaryOther}
                    onChange={(e) => set("dietaryOther", e.target.value)}
                    placeholder="e.g. Low-sodium"
                  />
                </div>
              )}
            </>
          )}

          {/* ── Payment ── */}
          {includePayment && (!isMultiStep || currentSectionKey === "payment") && (
            <>
              {!isMultiStep && (
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium text-foreground">Payment</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Enter your payment reference (e.g. GCash transaction ID).
                  </p>
                </div>
              )}

              {isMultiStep && (
                <p className="text-sm text-muted-foreground">
                  Enter your payment reference (e.g. GCash transaction ID).
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="paymentReference">Payment reference</Label>
                <Input
                  id="paymentReference"
                  value={form.paymentReference}
                  onChange={(e) => set("paymentReference", e.target.value)}
                  placeholder="Transaction or reference number"
                />
              </div>
            </>
          )}

          {/* ── Navigation ── */}
          {isMultiStep ? (
            <div className="flex gap-2 pt-2">
              {formStep > 1 && (
                <Button type="button" variant="outline" onClick={handleBack}>
                  Back
                </Button>
              )}
              {formStep < sections.length ? (
                <Button type="button" className="flex-1" onClick={handleNext}>
                  Next
                </Button>
              ) : (
                <Button type="button" className="flex-1" disabled={submitting} onClick={handleSubmit}>
                  {submitting ? "Checking…" : "Register"}
                </Button>
              )}
            </div>
          ) : (
            <Button type="button" className="w-full" disabled={submitting} onClick={handleSubmit}>
              {submitting ? "Checking…" : "Register"}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
