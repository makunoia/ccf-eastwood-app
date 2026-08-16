import type { FormContext } from "@/app/generated/prisma/client"
import {
  FORM_FIELD_KEYS,
  FORM_FIELD_META,
  FORM_SECTION_META,
  REQUIRABLE_KEYS,
  fieldsForContext,
  formLayoutFor,
  isRequirableSection,
  parentSectionFor,
  requiredKeyFor,
  type EventFormConfigData,
  type FormFieldKey,
  type FormToggleKey,
  type RequirableKey,
} from "./context-config"

/**
 * Server-side enforcement of the registration form config (CCF-117).
 *
 * The public form already withholds every disabled field on submit, so for
 * legitimate traffic these helpers are a no-op. They exist because the config is
 * meant to be a *contract*, not a UI convention: a crafted POST to the public
 * endpoint must not be able to store a field the admin turned off.
 *
 * **Disabled fields are neutralised, never nulled at the database.** A value here
 * is dropped from the payload before it reaches any write, and every write path
 * in `createRegistrant` fills only what is currently empty — so an existing
 * answer can never be erased by this. Writing `null` at the DB instead would
 * recreate the `saveGuestMatchingProfile` data-loss bug.
 */

/**
 * The config toggle that authorises each registrant payload field.
 *
 * Matching fields are gated on their **own** field toggle only, not additionally
 * on `sectionSmallGroup`. The form happens to nest them under the DGroup step
 * today, but making the server stricter than the config model would mean that
 * decoupling them in the UI later silently discards real answers — the exact
 * class of bug this enforcement is meant to prevent. Being permissive here can
 * only ever accept a crafted value for a field the admin already enabled.
 */
export const REGISTRANT_FIELD_GATES = {
  nickname: "fieldNickname",
  // Mobile and email became configurable in CCF-142. A form that drops mobile
  // falls back to email-only dedup in `registration-core.ts`, which is why the
  // config layer refuses to let both be turned off.
  mobileNumber: "fieldMobile",
  email: "fieldEmail",
  birthMonth: "fieldBirthDate",
  birthYear: "fieldBirthDate",
  ageRangeBucketId: "fieldAgeRange",
  lifeStageId: "fieldLifeStage",
  gender: "fieldGender",
  language: "fieldLanguage",
  meetingPreference: "fieldMeetingPreference",
  workCity: "fieldWorkCity",
  scheduleDayOfWeek: "fieldSchedule",
  scheduleTimeStart: "fieldSchedule",
  scheduleTimeEnd: "fieldSchedule",
  claimedSmallGroupId: "sectionSmallGroup",
  claimedSatellite: "sectionSmallGroup",
  wantsSmallGroup: "sectionSmallGroup",
  dietaryPreference: "sectionDietary",
  dietaryOther: "sectionDietary",
  paymentReference: "sectionPayment",
} as const satisfies Record<string, FormToggleKey>

export type GatedRegistrantField = keyof typeof REGISTRANT_FIELD_GATES

/** Fields whose empty value is a list rather than null. */
const LIST_FIELDS = new Set<GatedRegistrantField>(["language"])

/**
 * Every field toggle the builder offers must gate at least one payload field,
 * otherwise a toggle is decorative. Asserted in tests rather than at runtime.
 */
export function fieldKeysWithoutGate(): FormToggleKey[] {
  const gated = new Set<FormToggleKey>(Object.values(REGISTRANT_FIELD_GATES))
  return FORM_FIELD_KEYS.filter((key) => !gated.has(key))
}

/**
 * Returns the payload with every field the config disables reset to empty.
 * Fields absent from the payload are left absent.
 */
export function sanitizeRegistrantPayload<T extends object>(
  config: EventFormConfigData,
  payload: T
): T {
  const out = { ...payload } as Record<string, unknown>
  for (const [field, toggle] of Object.entries(REGISTRANT_FIELD_GATES) as [
    GatedRegistrantField,
    FormToggleKey,
  ][]) {
    if (config[toggle]) continue
    if (!(field in out)) continue
    out[field] = LIST_FIELDS.has(field) ? [] : null
  }
  return out as T
}

/**
 * Like {@link sanitizeRegistrantPayload}, but **removes** a disabled field's key
 * instead of emptying it.
 *
 * For the profile writers in `lib/people/matching-profile.ts`, which follow
 * "absent key = leave alone, explicit null = clear". Handing them a null for a
 * disabled field would erase whatever the person had already answered elsewhere
 * — the `saveGuestMatchingProfile` data-loss bug, re-created. Dropping the key
 * gives the same protection against a crafted POST without touching stored data.
 */
export function omitDisabledFields<T extends object>(
  config: EventFormConfigData,
  payload: T
): Partial<T> {
  const out = { ...payload } as Record<string, unknown>
  for (const [field, toggle] of Object.entries(REGISTRANT_FIELD_GATES) as [
    GatedRegistrantField,
    FormToggleKey,
  ][]) {
    if (config[toggle]) continue
    delete out[field]
  }
  return out as Partial<T>
}

/** Per-person household fields carry the same demographic gates. */
const HOUSEHOLD_MEMBER_GATES = [
  "nickname",
  "birthMonth",
  "birthYear",
  "gender",
  "ageRangeBucketId",
] as const satisfies readonly GatedRegistrantField[]

/**
 * The field toggles a household member's answers can be required against —
 * derived from the gates above so the two can't drift. Mobile and email are
 * absent by construction: the sub-form only asks the primary registrant for
 * contact details.
 */
export const HOUSEHOLD_MEMBER_FIELD_KEYS: readonly FormFieldKey[] = Array.from(
  new Set(HOUSEHOLD_MEMBER_GATES.map((f) => REGISTRANT_FIELD_GATES[f]))
) as FormFieldKey[]

export function sanitizeHouseholdMember<T extends object>(
  config: EventFormConfigData,
  member: T
): T {
  const out = { ...member } as Record<string, unknown>
  for (const field of HOUSEHOLD_MEMBER_GATES) {
    if (config[REGISTRANT_FIELD_GATES[field]]) continue
    if (!(field in out)) continue
    out[field] = null
  }
  return out as T
}

// ─── Required fields (CCF-142) ───────────────────────────────────────────────

/**
 * The payload keys that carry each field's answer. A field counts as answered
 * only when **every** key listed is filled in.
 *
 * Two deliberate asymmetries with `REGISTRANT_FIELD_GATES`, which maps the other
 * direction and lists every key a field owns:
 *  - Birth date wants both halves — a year without a month is not an answer.
 *  - Schedule wants only the day. The time window is genuinely optional ("any
 *    time" is a real answer, and `ScheduleInput` renders it as one), so demanding
 *    it would make a required schedule unanswerable for anyone with open
 *    availability.
 */
const REQUIRED_FIELD_PAYLOAD = {
  fieldNickname: ["nickname"],
  fieldMobile: ["mobileNumber"],
  fieldEmail: ["email"],
  fieldLifeStage: ["lifeStageId"],
  fieldGender: ["gender"],
  fieldBirthDate: ["birthMonth", "birthYear"],
  fieldAgeRange: ["ageRangeBucketId"],
  fieldWorkCity: ["workCity"],
  fieldLanguage: ["language"],
  fieldSchedule: ["scheduleDayOfWeek"],
  fieldMeetingPreference: ["meetingPreference"],
  // The two requirable sections. Each owns exactly one answer, which is what
  // makes "required" mean something for them — see `REQUIRABLE_SECTION_KEYS`.
  // `dietaryOther` is deliberately absent: it's the free-text tail of the Other
  // option, not a second answer, and demanding it would make every non-Other
  // choice fail.
  sectionDietary: ["dietaryPreference"],
  sectionPayment: ["paymentReference"],
} as const satisfies Record<RequirableKey, readonly string[]>

/**
 * Whether a payload value counts as given.
 *
 * Explicitly not a falsy check: `scheduleDayOfWeek` is 0 for Sunday, and a
 * truthiness test would read that as unanswered and reject every Sunday.
 */
function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false
  if (Array.isArray(value)) return value.length > 0
  return true
}

/**
 * The enabled-and-required fields this payload leaves blank.
 *
 * Required is meaningful only on an enabled field: a flag left set on a field the
 * admin has since switched off is ignored here rather than cleared on write, so
 * switching the field back on restores the configuration that was there before.
 *
 * `only` narrows the check to a subset — the household sub-form asks for a
 * handful of demographics, not the whole registrant payload.
 */
export function missingRequiredFields(
  config: EventFormConfigData,
  payload: Record<string, unknown>,
  only?: readonly RequirableKey[]
): RequirableKey[] {
  const candidates = only ?? REQUIRABLE_KEYS
  return candidates.filter((key) => {
    if (!config[key]) return false
    if (!config[requiredKeyFor(key)]) return false
    return !REQUIRED_FIELD_PAYLOAD[key].every((k) => isAnswered(payload[k]))
  })
}

/**
 * The fields this submission was actually asked for.
 *
 * Enabling a field isn't the same as putting it in front of someone: the four
 * matching fields live inside the DGroup step, which only opens for a person who
 * says they're looking for a group. Requiring one of those would otherwise make
 * the form unsubmittable for everyone who answers "I'm already in one" — they'd
 * be blocked on a question the form never showed them.
 *
 * Derived from `parentSectionFor` rather than a second list of which fields hang
 * off the DGroup step, so the layout stays the only place that knows.
 *
 * The requirable sections join the list unconditionally where the context has
 * them: they are steps in their own right rather than questions nested under
 * someone's answer, so nothing can hide one the way "I'm already in a group"
 * hides the matching fields.
 */
export function askedFieldsFor(
  context: FormContext,
  payload: Record<string, unknown>
): RequirableKey[] {
  const fields = fieldsForContext(context).filter((field) => {
    if (parentSectionFor(field, context) !== "sectionSmallGroup") return true
    return payload.wantsSmallGroup === true
  })
  const sections = formLayoutFor(context)
    .map((s) => s.key)
    .filter(isRequirableSection)
  return [...fields, ...sections]
}

/** Toggle keys as the labels the builder shows, for use in an error message. */
export function requiredFieldLabels(keys: readonly RequirableKey[]): string {
  return keys
    .map((k) => (isRequirableSection(k) ? FORM_SECTION_META[k] : FORM_FIELD_META[k]).label)
    .join(", ")
}

/** The user-facing error for {@link missingRequiredFields}, in the builder's own labels. */
export function requiredFieldsMessage(fields: readonly RequirableKey[]): string {
  if (fields.length === 1) return `${requiredFieldLabels(fields)} is required.`
  return `These are required: ${requiredFieldLabels(fields)}.`
}

/**
 * A breakout pick is only honored when this context offers the picker. Auto-assign
 * is unaffected: it runs off a null selection, so turning the section off leaves
 * automatic placement working exactly as before.
 */
export function resolveBreakoutSelection(
  config: EventFormConfigData,
  selectedBreakoutGroupId: string | null | undefined
): string | null {
  if (!config.sectionBreakout) return null
  return selectedBreakoutGroupId ?? null
}
