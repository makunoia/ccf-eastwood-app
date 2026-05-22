"use client"

import * as React from "react"
import { IconCheck } from "@tabler/icons-react"
import { PhonePHInput } from "@/components/ui/phone-ph-input"
import { OptionalEmailInput } from "@/components/ui/optional-email-input"
import { TimeInput } from "@/components/ui/time-input"
import { MultiSelect } from "@/components/ui/multi-select"
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
import { LANGUAGE_OPTIONS, CITY_OPTIONS } from "@/lib/constants/group-options"
import { lookupVolunteer, submitVolunteerInfo } from "./actions"
import { type VolunteerIdentity, type VolunteerInfoInput, type GroupFields } from "./types"

type LifeStage = { id: string; name: string }

type Props = {
  eventId: string
  lifeStages: LifeStage[]
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const MEETING_FORMAT_OPTIONS = [
  { value: "Online", label: "Online" },
  { value: "Hybrid", label: "Hybrid" },
  { value: "InPerson", label: "In Person" },
] as const

const GENDER_FOCUS_OPTIONS = [
  { value: "Mixed", label: "Mixed" },
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
] as const

type LeadershipStatus = "leader" | "timothy" | "none"

function emptyGroupFields(): GroupFields {
  return {
    name: "",
    lifeStageId: null,
    genderFocus: null,
    language: [],
    ageRangeMin: null,
    ageRangeMax: null,
    meetingFormat: null,
    locationCity: null,
    memberLimit: null,
    scheduleDayOfWeek: null,
    scheduleTimeStart: null,
    scheduleTimeEnd: null,
  }
}

// ─── Group fields editor ──────────────────────────────────────────────────────

function GroupFieldsEditor({
  value,
  onChange,
  lifeStages,
  nameLabel,
}: {
  value: GroupFields
  onChange: (v: GroupFields) => void
  lifeStages: LifeStage[]
  nameLabel: string
}) {
  return (
    <div className="space-y-4 pt-1">
      <div className="space-y-1.5">
        <Label>{nameLabel}</Label>
        <Input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="e.g. Friday Night Group"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Life Stage</Label>
          <Select
            value={value.lifeStageId ?? "none"}
            onValueChange={(v) => onChange({ ...value, lifeStageId: v === "none" ? null : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not specified</SelectItem>
              {lifeStages.map((ls) => (
                <SelectItem key={ls.id} value={ls.id}>
                  {ls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Gender focus</Label>
          <Select
            value={value.genderFocus ?? ""}
            onValueChange={(v) =>
              onChange({ ...value, genderFocus: v as GroupFields["genderFocus"] })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {GENDER_FOCUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Language</Label>
        <MultiSelect
          options={LANGUAGE_OPTIONS}
          value={value.language}
          onChange={(v) => onChange({ ...value, language: v })}
          placeholder="Select languages"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Min Age</Label>
          <Input
            type="number"
            min={0}
            value={value.ageRangeMin ?? ""}
            onChange={(e) => onChange({ ...value, ageRangeMin: e.target.value ? parseInt(e.target.value, 10) : null })}
            placeholder="e.g. 18"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Max Age</Label>
          <Input
            type="number"
            min={0}
            value={value.ageRangeMax ?? ""}
            onChange={(e) => onChange({ ...value, ageRangeMax: e.target.value ? parseInt(e.target.value, 10) : null })}
            placeholder="e.g. 30"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Meeting format</Label>
          <Select
            value={value.meetingFormat ?? "none"}
            onValueChange={(v) =>
              onChange({ ...value, meetingFormat: v === "none" ? null : (v as GroupFields["meetingFormat"]) })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not specified</SelectItem>
              {MEETING_FORMAT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Location / City</Label>
          <Select
            value={value.locationCity ?? "_none"}
            onValueChange={(v) => onChange({ ...value, locationCity: v === "_none" ? null : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select city" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Not specified</SelectItem>
              {CITY_OPTIONS.map((city) => (
                <SelectItem key={city} value={city}>
                  {city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Member Limit</Label>
        <Input
          type="number"
          min={1}
          value={value.memberLimit ?? ""}
          onChange={(e) => onChange({ ...value, memberLimit: e.target.value ? parseInt(e.target.value, 10) : null })}
          placeholder="e.g. 12"
        />
      </div>

      <div className="space-y-2">
        <Label>Meeting schedule</Label>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Day</Label>
            <Select
              value={value.scheduleDayOfWeek !== null ? String(value.scheduleDayOfWeek) : "none"}
              onValueChange={(v) =>
                onChange({ ...value, scheduleDayOfWeek: v === "none" ? null : Number(v) })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Day" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {DAYS.map((d, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Start</Label>
            <TimeInput
              value={value.scheduleTimeStart ?? ""}
              onChange={(v) => onChange({ ...value, scheduleTimeStart: v || null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">End</Label>
            <TimeInput
              value={value.scheduleTimeEnd ?? ""}
              onChange={(v) => onChange({ ...value, scheduleTimeEnd: v || null })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main form ────────────────────────────────────────────────────────────────

export function VolunteerInfoForm({ eventId, lifeStages }: Props) {
  const [phase, setPhase] = React.useState<"lookup" | "form" | "done">("lookup")
  const [identity, setIdentity] = React.useState<VolunteerIdentity | null>(null)

  // Lookup
  const [lookupPhone, setLookupPhone] = React.useState("")
  const [lookupError, setLookupError] = React.useState("")
  const [lookupLoading, setLookupLoading] = React.useState(false)

  // Personal
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [noEmail, setNoEmail] = React.useState(false)
  const [phone, setPhone] = React.useState("")

  // Leadership
  const [leadershipStatus, setLeadershipStatus] = React.useState<LeadershipStatus>("none")
  const [groupFields, setGroupFields] = React.useState<GroupFields>(emptyGroupFields())

  // Submit
  const [submitting, setSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState("")

  // ── Lookup ──────────────────────────────────────────────────────────────────
  async function handleLookup() {
    if (!lookupPhone.trim()) {
      setLookupError("Please enter your mobile number")
      return
    }
    setLookupError("")
    setLookupLoading(true)
    const result = await lookupVolunteer(eventId, lookupPhone)
    setLookupLoading(false)

    if (!result.success) {
      setLookupError(result.error)
      return
    }

    const v = result.data
    setIdentity(v)
    setFirstName(v.firstName)
    setLastName(v.lastName)
    setEmail(v.email ?? "")
    setPhone(v.phone ?? lookupPhone)

    // Prioritize ledGroup existence: a member who leads a group should always
    // be treated as leader/timothy even if groupStatus is stale or null.
    if (v.groupStatus === "Timothy") {
      setLeadershipStatus("timothy")
    } else if (v.groupStatus === "Leader" || v.ledGroup) {
      setLeadershipStatus("leader")
    } else {
      setLeadershipStatus("none")
    }

    // Pre-fill group fields from their existing led group (leader or Timothy with pending group)
    if (v.ledGroup) {
      setGroupFields({
        name: v.ledGroup.name,
        lifeStageId: v.ledGroup.lifeStageId,
        genderFocus: v.ledGroup.genderFocus,
        language: v.ledGroup.language,
        ageRangeMin: v.ledGroup.ageRangeMin,
        ageRangeMax: v.ledGroup.ageRangeMax,
        meetingFormat: v.ledGroup.meetingFormat,
        locationCity: v.ledGroup.locationCity,
        memberLimit: v.ledGroup.memberLimit,
        scheduleDayOfWeek: v.ledGroup.scheduleDayOfWeek,
        scheduleTimeStart: v.ledGroup.scheduleTimeStart,
        scheduleTimeEnd: v.ledGroup.scheduleTimeEnd,
      })
    } else if (v.groupStatus === "Timothy" && v.schedulePreferences.length > 0) {
      // Timothy with no pending group yet — pre-fill schedule from their preferences
      const pref = v.schedulePreferences[0]
      setGroupFields({
        ...emptyGroupFields(),
        scheduleDayOfWeek: pref.dayOfWeek,
        scheduleTimeStart: pref.timeStart,
        scheduleTimeEnd: pref.timeEnd ?? null,
      })
    }

    setPhase("form")
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!identity) return

    setSubmitError("")
    setSubmitting(true)

    const input: VolunteerInfoInput = {
      memberId: identity.memberId,
      eventId,
      firstName,
      lastName,
      email: noEmail ? null : email.trim() || null,
      phone,
      leadershipStatus,
      groupFields: leadershipStatus !== "none" ? groupFields : null,
    }

    const result = await submitVolunteerInfo(input)
    setSubmitting(false)

    if (!result.success) {
      setSubmitError(result.error)
      return
    }

    setPhase("done")
  }

  // ── Lookup phase ────────────────────────────────────────────────────────────
  if (phase === "lookup") {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-6">
        <div className="space-y-1.5">
          <Label htmlFor="lookup-phone">Your mobile number</Label>
          <PhonePHInput
            id="lookup-phone"
            value={lookupPhone}
            onChange={setLookupPhone}
            onKeyDown={(e) => e.key === "Enter" && handleLookup()}
            autoFocus
          />
        </div>
        {lookupError && <p className="text-sm text-destructive">{lookupError}</p>}
        <Button type="button" className="w-full" onClick={handleLookup} disabled={lookupLoading}>
          {lookupLoading ? "Looking up…" : "Continue"}
        </Button>
      </div>
    )
  }

  // ── Done phase ──────────────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div className="rounded-xl border bg-card p-8 text-center space-y-3">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-emerald-50">
          <IconCheck className="size-6 text-emerald-700" />
        </span>
        <h2 className="text-lg font-semibold">Information updated</h2>
        <p className="text-sm text-muted-foreground">Thank you! Your information has been saved.</p>
      </div>
    )
  }

  // ── Form phase ──────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Section 1: Personal */}
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Personal Information
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <OptionalEmailInput
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            noEmail={noEmail}
            onNoEmailChange={(checked) => {
              setNoEmail(checked)
              if (checked) setEmail("")
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Mobile number</Label>
          <PhonePHInput id="phone" value={phone} onChange={setPhone} />
        </div>
      </section>

      {/* Section 2: Leadership */}
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Small Group Leadership
        </h2>

        {identity?.ledGroup ? (
          // Already leads a group — skip the status question, show form directly
          <GroupFieldsEditor
            value={groupFields}
            onChange={setGroupFields}
            lifeStages={lifeStages}
            nameLabel="Group name"
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              What is your current small group leadership status?
            </p>

            <div className="flex gap-2">
              {(["leader", "timothy", "none"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setLeadershipStatus(v)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                    leadershipStatus === v
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-muted/50"
                  }`}
                >
                  {v === "leader" ? "I lead a group" : v === "timothy" ? "I'm a Timothy" : "Neither"}
                </button>
              ))}
            </div>

            {leadershipStatus === "leader" && (
              <GroupFieldsEditor
                value={groupFields}
                onChange={setGroupFields}
                lifeStages={lifeStages}
                nameLabel="Group name"
              />
            )}

            {leadershipStatus === "timothy" && (
              <GroupFieldsEditor
                value={groupFields}
                onChange={setGroupFields}
                lifeStages={lifeStages}
                nameLabel="Intended group name"
              />
            )}
          </>
        )}
      </section>

      {submitError && (
        <p className="text-sm text-destructive text-center">{submitError}</p>
      )}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Saving…" : "Save Information"}
      </Button>
    </form>
  )
}
