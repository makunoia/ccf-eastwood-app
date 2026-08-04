import {
  FORM_FIELD_KEYS,
  type EventFormConfigData,
  type FormToggleKey,
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

/** Per-person household fields carry the same demographic gates. */
const HOUSEHOLD_MEMBER_GATES = [
  "nickname",
  "birthMonth",
  "birthYear",
  "gender",
  "ageRangeBucketId",
] as const satisfies readonly GatedRegistrantField[]

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
