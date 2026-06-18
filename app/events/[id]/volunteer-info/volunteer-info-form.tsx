"use client"

import * as React from "react"
import { IconCheck } from "@tabler/icons-react"
import { PhonePHInput } from "@/components/ui/phone-ph-input"
import { OptionalEmailInput } from "@/components/ui/optional-email-input"
import { ScheduleInput } from "@/components/ui/schedule-input"
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
    lifeStageIds: [],
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

function groupToFields(g: VolunteerIdentity["ledGroups"][number]): GroupFields {
  return {
    name: g.name,
    lifeStageIds: g.lifeStageIds,
    genderFocus: g.genderFocus,
    language: g.language,
    ageRangeMin: g.ageRangeMin,
    ageRangeMax: g.ageRangeMax,
    meetingFormat: g.meetingFormat,
    locationCity: g.locationCity,
    memberLimit: g.memberLimit,
    scheduleDayOfWeek: g.scheduleDayOfWeek,
    scheduleTimeStart: g.scheduleTimeStart,
    scheduleTimeEnd: g.scheduleTimeEnd,
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
          <Label>Life Stages</Label>
          <MultiSelect
            className="w-full"
            placeholder="Select"
            options={lifeStages.map((ls) => ({ value: ls.id, label: ls.name }))}
            value={value.lifeStageIds}
            onChange={(v) => onChange({ ...value, lifeStageIds: v })}
          />
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
        <ScheduleInput
          dayOfWeek={value.scheduleDayOfWeek !== null ? String(value.scheduleDayOfWeek) : ""}
          timeStart={value.scheduleTimeStart ?? ""}
          timeEnd={value.scheduleTimeEnd ?? ""}
          onDayChange={(v) => onChange({ ...value, scheduleDayOfWeek: v ? Number(v) : null })}
          onTimeStartChange={(v) => onChange({ ...value, scheduleTimeStart: v || null })}
          onTimeEndChange={(v) => onChange({ ...value, scheduleTimeEnd: v || null })}
          allowAny
        />
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
  const [selectedGroupId, setSelectedGroupId] = React.useState<string | null>(null)
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

    // Prioritize led-group existence: a member who leads a group should always
    // be treated as leader/timothy even if groupStatus is stale or null.
    if (v.groupStatus === "Timothy") {
      setLeadershipStatus("timothy")
    } else if (v.groupStatus === "Leader" || v.ledGroups.length > 0) {
      setLeadershipStatus("leader")
    } else {
      setLeadershipStatus("none")
    }

    // Pre-fill group fields from their existing led group (leader or Timothy with pending group)
    const firstGroup = v.ledGroups[0]
    if (firstGroup) {
      setSelectedGroupId(firstGroup.id)
      setGroupFields(groupToFields(firstGroup))
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
      groupId: leadershipStatus !== "none" ? selectedGroupId : null,
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

        {identity && identity.ledGroups.length > 0 ? (
          // Already leads a group — skip the status question, show form directly
          <div className="space-y-4">
            {identity.ledGroups.length > 1 && (
              <div className="space-y-1.5">
                <Label>Which group are you updating?</Label>
                <Select
                  value={selectedGroupId ?? undefined}
                  onValueChange={(id) => {
                    setSelectedGroupId(id)
                    const g = identity.ledGroups.find((lg) => lg.id === id)
                    if (g) setGroupFields(groupToFields(g))
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {identity.ledGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <GroupFieldsEditor
              value={groupFields}
              onChange={setGroupFields}
              lifeStages={lifeStages}
              nameLabel="Group name"
            />
          </div>
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
