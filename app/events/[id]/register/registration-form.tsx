"use client"

import * as React from "react"
import { IconCheck } from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  createRegistrant,
  lookupMemberByMobile,
} from "@/app/(dashboard)/events/actions"
import { LANGUAGE_OPTIONS, CITY_OPTIONS } from "@/lib/constants/group-options"

type Step = "form" | "confirm" | "done"

type LifeStage = { id: string; name: string }

type FormValues = {
  firstName: string
  lastName: string
  nickname: string
  email: string
  mobileNumber: string
  lifeStageId: string
  gender: string
  language: string[]
  meetingPreference: string
  workCity: string
  scheduleDayOfWeek: string
  scheduleTimeStart: string
  scheduleTimeEnd: string
}

type MatchedMember = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
}

const defaultForm: FormValues = {
  firstName: "",
  lastName: "",
  nickname: "",
  email: "",
  mobileNumber: "",
  lifeStageId: "",
  gender: "",
  language: [],
  meetingPreference: "",
  workCity: "",
  scheduleDayOfWeek: "",
  scheduleTimeStart: "",
  scheduleTimeEnd: "",
}

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
  isRecurring?: boolean
  lifeStages?: LifeStage[]
}

export function RegistrationForm({ eventId, isRecurring = false, lifeStages = [] }: Props) {
  const [step, setStep] = React.useState<Step>("form")
  const [form, setForm] = React.useState<FormValues>(defaultForm)
  const [submitting, setSubmitting] = React.useState(false)
  const [matchedMember, setMatchedMember] = React.useState<MatchedMember | null>(null)

  function set(field: keyof FormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function toggleLanguage(lang: string) {
    setForm((prev) => ({
      ...prev,
      language: prev.language.includes(lang)
        ? prev.language.filter((l) => l !== lang)
        : [...prev.language, lang],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    // Check for existing member by mobile
    const match = await lookupMemberByMobile(form.mobileNumber)
    setSubmitting(false)

    if (match) {
      setMatchedMember(match)
      setStep("confirm")
    } else {
      await register(null)
    }
  }

  async function register(confirmedMemberId: string | null) {
    setSubmitting(true)
    const result = await createRegistrant(eventId, {
      firstName: form.firstName,
      lastName: form.lastName,
      nickname: form.nickname,
      email: form.email,
      mobileNumber: form.mobileNumber,
      lifeStageId: form.lifeStageId || null,
      gender: (form.gender || null) as "Male" | "Female" | null,
      language: form.language,
      meetingPreference: (form.meetingPreference || null) as "Online" | "Hybrid" | "InPerson" | null,
      workCity: form.workCity || null,
      scheduleDayOfWeek: form.scheduleDayOfWeek !== "" ? parseInt(form.scheduleDayOfWeek, 10) : null,
      scheduleTimeStart: form.scheduleTimeStart || null,
      scheduleTimeEnd: form.scheduleTimeEnd || null,
    }, confirmedMemberId)
    setSubmitting(false)

    if (result.success) {
      setStep("done")
    } else {
      toast.error(result.error)
    }
  }

  if (step === "done") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10">
          <div className="flex size-14 items-center justify-center rounded-full bg-green-100">
            <IconCheck className="size-7 text-green-600" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold">You&apos;re registered!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;ll see you at the event.
            </p>
          </div>
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
            We found an existing record matching your mobile number.
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
              onClick={() => register(matchedMember.id)}
              disabled={submitting}
            >
              {submitting ? "Registering…" : "Yes, that's me"}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => register(null)}
              disabled={submitting}
            >
              {submitting ? "Registering…" : "That's not me"}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Register</CardTitle>
        <CardDescription>Fill in your details to register for this event.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
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
                required
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
                required
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
            <Label htmlFor="mobileNumber">
              Mobile Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="mobileNumber"
              type="tel"
              value={form.mobileNumber}
              onChange={(e) => set("mobileNumber", e.target.value)}
              placeholder="+63 917 123 4567"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="juan@email.com"
            />
          </div>

          {isRecurring && (
            <>
              <div className="pt-2 border-t">
                <p className="text-sm font-medium text-foreground">Help us connect you</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  These optional details help us find the right Breakout Group for you.
                </p>
              </div>

              {/* Life Stage */}
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
                      onClick={() =>
                        set("meetingPreference", form.meetingPreference === opt.value ? "" : opt.value)
                      }
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
                    onValueChange={(v) => set("scheduleDayOfWeek", v === "none" ? "" : v)}
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
                    onChange={(e) => set("scheduleTimeStart", e.target.value)}
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input
                    type="time"
                    value={form.scheduleTimeEnd}
                    onChange={(e) => set("scheduleTimeEnd", e.target.value)}
                    className="w-28"
                  />
                </div>
              </div>

              {/* City */}
              <div className="space-y-2">
                <Label>Work city</Label>
                <Select
                  value={form.workCity}
                  onValueChange={(v) => set("workCity", v === "_none" ? "" : v)}
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
            </>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Checking…" : "Register"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
