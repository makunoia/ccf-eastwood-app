/**
 * Turning a stored Member/Guest profile into a reviewable registration (CCF-147).
 *
 * Pure — no `db`, no `server-only` — so the server action that produces the
 * snapshot, the client that renders it, and the tests all agree on one shape.
 */

import type { FormContext } from "@/app/generated/prisma/client"
import {
  FORM_FIELD_META,
  type EventFormConfigData,
  type FormFieldKey,
} from "@/lib/forms/context-config"
import { askedFieldsFor, missingRequiredFields } from "@/lib/forms/registration-payload"
import {
  formatBirthDate,
  formatLanguages,
  formatMeetingPreference,
  formatSchedule,
} from "@/lib/forms/registration-responses"

/**
 * Everything the review screen needs about the person it just pulled up.
 *
 * `email` is the real address and `emailMasked` is what the summary shows. The
 * summary masks because email is the harvestable half of the contact pair — the
 * mobile is already known to whoever typed it — but the edit form needs the real
 * value or "edit any field" would mean retyping it blind. Passing the second
 * factor is what buys the real value; that check is the trust boundary, not this
 * type.
 */
export type RegistrationProfileSnapshot = {
  recordId: string
  recordType: "member" | "guest"
  firstName: string
  lastName: string
  nickname: string | null
  email: string | null
  emailMasked: string | null
  phone: string | null
  birthMonth: number | null
  birthYear: number | null
  ageRangeBucketId: string | null
  lifeStageId: string | null
  gender: "Male" | "Female" | null
  language: string[]
  meetingPreference: "Online" | "Hybrid" | "InPerson" | null
  workCity: string | null
  scheduleDayOfWeek: number | null
  scheduleTimeStart: string | null
  scheduleTimeEnd: string | null
  /** Member-only. Non-null means the DGroup step has nothing to ask. */
  smallGroupId: string | null
  claimedSmallGroupId: string | null
  claimedSatellite: string | null
  /** Volunteers don't register as attendees — routes to the existing block screen. */
  isVolunteer: boolean
}

/**
 * The registration form holds every answer as a string (or a string array), so
 * the snapshot has to be flattened before it can seed form state. A structural
 * subset of the form's own `FormValues`, so it spreads straight in.
 */
export type RegistrationFormPrefill = {
  firstName: string
  lastName: string
  nickname: string
  email: string
  mobileNumber: string
  birthMonth: string
  birthYear: string
  ageRangeBucketId: string
  lifeStageId: string
  gender: string
  language: string[]
  meetingPreference: string
  workCity: string
  scheduleDayOfWeek: string
  scheduleTimeStart: string
  scheduleTimeEnd: string
}

const str = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? "" : String(v)

export function prefillFromProfile(
  snapshot: RegistrationProfileSnapshot
): RegistrationFormPrefill {
  return {
    firstName: snapshot.firstName,
    lastName: snapshot.lastName,
    nickname: str(snapshot.nickname),
    email: str(snapshot.email),
    mobileNumber: str(snapshot.phone),
    birthMonth: str(snapshot.birthMonth),
    birthYear: str(snapshot.birthYear),
    ageRangeBucketId: str(snapshot.ageRangeBucketId),
    lifeStageId: str(snapshot.lifeStageId),
    gender: str(snapshot.gender),
    language: snapshot.language,
    meetingPreference: str(snapshot.meetingPreference),
    workCity: str(snapshot.workCity),
    scheduleDayOfWeek: str(snapshot.scheduleDayOfWeek),
    scheduleTimeStart: str(snapshot.scheduleTimeStart),
    scheduleTimeEnd: str(snapshot.scheduleTimeEnd),
  }
}

/**
 * The answers this registration holds, keyed the way the payload is.
 *
 * Deliberately the *merged* view — profile first, then anything typed on top —
 * because that is what decides which questions the fast path still has to ask.
 * Feeding it to the same `missingRequiredFields` the server runs is the point:
 * a second "is this section done?" rule would drift from the first one.
 */
export function mergedAnswersFor(
  snapshot: RegistrationProfileSnapshot | null,
  typed: Record<string, unknown>
): Record<string, unknown> {
  if (!snapshot) return typed
  const fromProfile = prefillFromProfile(snapshot)
  const merged: Record<string, unknown> = { ...typed }
  for (const [key, value] of Object.entries(fromProfile)) {
    const answered = Array.isArray(value) ? value.length > 0 : value !== ""
    const alreadyTyped = merged[key]
    const typedAnswered = Array.isArray(alreadyTyped)
      ? alreadyTyped.length > 0
      : alreadyTyped !== "" && alreadyTyped !== null && alreadyTyped !== undefined
    if (!typedAnswered && answered) merged[key] = value
  }
  return merged
}

/**
 * Which questions the shortened flow still has to put in front of someone.
 *
 * A field marked Required that the profile can't satisfy is still Required — the
 * skip keys off *profile nulls*, never off "we already showed them a screen".
 * Thin wrapper over the existing pair so the client, the server and the tests
 * name the same thing.
 */
export function fieldsStillNeeded(
  config: EventFormConfigData,
  context: FormContext,
  mergedAnswers: Record<string, unknown>
): FormFieldKey[] {
  return missingRequiredFields(
    config,
    mergedAnswers,
    askedFieldsFor(context, mergedAnswers)
  )
}

export type ProfileSummaryRow = { key: string; label: string; value: string }

/**
 * The read-only summary the review screen leads with.
 *
 * Only rows the person can actually see the meaning of: a field this form has
 * switched off is omitted (showing it would advertise data the event never asked
 * for), and so is one the profile has nothing for — a wall of "—" reads as a
 * form to fill in, which is exactly the impression the fast path is meant to
 * remove. Id-shaped fields (life stage, age range) need their display names
 * passed in; the form already holds both lists.
 */
export function profileSummaryRows(
  snapshot: RegistrationProfileSnapshot,
  config: EventFormConfigData,
  lookups: {
    lifeStages?: { id: string; name: string }[]
    ageRanges?: { id: string; label: string }[]
  } = {}
): ProfileSummaryRow[] {
  const rows: ProfileSummaryRow[] = [
    {
      key: "name",
      label: "Name",
      value: [snapshot.firstName, snapshot.lastName].filter(Boolean).join(" "),
    },
  ]

  const push = (key: string, field: FormFieldKey, value: string | null) => {
    if (!config[field]) return
    if (!value) return
    rows.push({ key, label: FORM_FIELD_META[field].label, value })
  }

  push("nickname", "fieldNickname", snapshot.nickname)
  push("mobile", "fieldMobile", snapshot.phone)
  push("email", "fieldEmail", snapshot.emailMasked)
  push(
    "lifeStage",
    "fieldLifeStage",
    lookups.lifeStages?.find((l) => l.id === snapshot.lifeStageId)?.name ?? null
  )
  push("birthDate", "fieldBirthDate", formatBirthDate(snapshot.birthMonth, snapshot.birthYear))
  push(
    "ageRange",
    "fieldAgeRange",
    lookups.ageRanges?.find((a) => a.id === snapshot.ageRangeBucketId)?.label ?? null
  )
  push("gender", "fieldGender", snapshot.gender)
  push("workCity", "fieldWorkCity", snapshot.workCity)
  push("language", "fieldLanguage", formatLanguages(snapshot.language))
  push("meetingPreference", "fieldMeetingPreference", formatMeetingPreference(snapshot.meetingPreference))
  push(
    "schedule",
    "fieldSchedule",
    formatSchedule(
      snapshot.scheduleDayOfWeek,
      snapshot.scheduleTimeStart,
      snapshot.scheduleTimeEnd
    )
  )

  return rows
}
