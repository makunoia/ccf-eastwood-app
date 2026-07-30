import type { FormContext } from "@/app/generated/prisma/client"

/**
 * Per-(event, context) registration form configuration.
 *
 * Register / Walk-in / Check-in each control their own sections and fields. A
 * missing row means "bare" — only the mandatory identity fields (name plus
 * mobile/email), which is the default for new events. Existing events were
 * backfilled by the migration so their pre-existing behavior carried over.
 */

export const FORM_CONTEXTS = ["Register", "WalkIn", "CheckIn"] as const

export const FORM_SECTION_KEYS = [
  "sectionSmallGroup",
  "sectionBreakout",
  "sectionDietary",
  "sectionPayment",
  "sectionFamily",
] as const

export const FORM_FIELD_KEYS = [
  "fieldLifeStage",
  "fieldGender",
  "fieldBirthDate",
  "fieldAgeRange",
  "fieldWorkCity",
  "fieldLanguage",
  "fieldSchedule",
  "fieldMeetingPreference",
] as const

/**
 * Modifiers on a section rather than sections in their own right. Persisted and
 * validated exactly like the other toggles, but rendered nested under their
 * parent section instead of as a top-level row in the builder.
 */
export const FORM_OPTION_KEYS = ["familySpouseOnly"] as const

/** Which section each option hangs off, for grouping in the builder. */
export const FORM_OPTION_PARENT: Record<FormOptionKey, FormSectionKey> = {
  familySpouseOnly: "sectionFamily",
}

export type FormSectionKey = (typeof FORM_SECTION_KEYS)[number]
export type FormFieldKey = (typeof FORM_FIELD_KEYS)[number]
export type FormOptionKey = (typeof FORM_OPTION_KEYS)[number]
export type FormToggleKey = FormSectionKey | FormFieldKey | FormOptionKey

export const FORM_TOGGLE_KEYS: readonly FormToggleKey[] = [
  ...FORM_SECTION_KEYS,
  ...FORM_FIELD_KEYS,
  ...FORM_OPTION_KEYS,
]

export type EventFormConfigData = Record<FormToggleKey, boolean>

/** Every toggle off — the "bare" form. */
export const BARE_EVENT_FORM_CONFIG: EventFormConfigData = Object.freeze(
  Object.fromEntries(FORM_TOGGLE_KEYS.map((k) => [k, false])) as EventFormConfigData,
)

// ─── Success screen copy (CCF-130) ───────────────────────────────────────────

/**
 * The sub copy under "Welcome, <name>!" on the registration success screen.
 *
 * The stock copy tells people to bring a friend, which is right for an open
 * event and wrong for an invite-only one — so it's overridable per (event,
 * context) rather than hardcoded in the form. Null/blank means "use the default",
 * which keeps every existing event on exactly the copy it had before.
 *
 * Walk-in keeps its own default: someone standing at the kiosk has already
 * arrived, so inviting them to bring a friend reads oddly. Check-in never shows
 * this screen at all.
 */
export const SUCCESS_MESSAGE_MAX_LENGTH = 300

const DEFAULT_SUCCESS_MESSAGE_WITH_EVENT = (eventName: string) =>
  `You're all set for ${eventName}. We're so glad you're coming — feel free to bring a friend!`

const DEFAULT_SUCCESS_MESSAGE =
  "You're all set! We're so glad you're joining us. Feel free to bring a friend — see you soon!"

const DEFAULT_WALKIN_SUCCESS_MESSAGE = "You're registered and checked in. Enjoy the event!"

/**
 * The copy an admin sees as the starting point in the builder, and what the form
 * renders when nothing is configured.
 */
export function defaultSuccessMessage(context: FormContext, eventName?: string): string {
  if (context === "WalkIn") return DEFAULT_WALKIN_SUCCESS_MESSAGE
  return eventName
    ? DEFAULT_SUCCESS_MESSAGE_WITH_EVENT(eventName)
    : DEFAULT_SUCCESS_MESSAGE
}

/**
 * Resolve what the success screen actually shows. A stored message that is blank
 * or whitespace-only is treated as unset — clearing the textarea is how an admin
 * goes back to the default.
 */
export function resolveSuccessMessage(
  stored: string | null | undefined,
  context: FormContext,
  eventName?: string
): string {
  const trimmed = stored?.trim()
  return trimmed ? trimmed : defaultSuccessMessage(context, eventName)
}

// ─── Display metadata ────────────────────────────────────────────────────────
// Pure data only — no icons. Icons are attached client-side so nothing
// non-serializable crosses the server/client boundary.

export type FormToggleMeta = {
  key: FormToggleKey
  label: string
  description: string
}

export const FORM_SECTION_META: Record<FormSectionKey, FormToggleMeta> = {
  sectionSmallGroup: {
    key: "sectionSmallGroup",
    label: "DGroup",
    description:
      "Ask whether the person wants to join a DGroup or is already in one, and collect their matching preferences.",
  },
  sectionBreakout: {
    key: "sectionBreakout",
    label: "Breakout Group selection",
    description:
      "Let the person pick their own breakout group. Turn off to assign groups yourself or auto-assign on submit.",
  },
  sectionDietary: {
    key: "sectionDietary",
    label: "Dietary Restrictions",
    description:
      "Ask whether the person has dietary preferences (Vegetarian, Vegan, Halal, etc.).",
  },
  sectionPayment: {
    key: "sectionPayment",
    label: "Payment Reference",
    description: "Ask for a payment reference (e.g. a GCash transaction ID) on submission.",
  },
  sectionFamily: {
    key: "sectionFamily",
    label: "Family mode",
    description:
      "Let one person register their whole household in one pass. They're saved as a Family, so check-in can bring them all in together.",
  },
}

export const FORM_FIELD_META: Record<FormFieldKey, FormToggleMeta> = {
  fieldLifeStage: {
    key: "fieldLifeStage",
    label: "Life Stage",
    description: "Which life stage the person belongs to.",
  },
  fieldGender: {
    key: "fieldGender",
    label: "Gender",
    description: "Male or Female.",
  },
  fieldBirthDate: {
    key: "fieldBirthDate",
    label: "Birth Month + Year",
    description:
      "The matching engine's source of truth for age. Also helps match returning people to an existing record.",
  },
  fieldAgeRange: {
    key: "fieldAgeRange",
    label: "Age Range",
    description:
      "A coarser alternative to birth date, picked from configurable buckets. Used for matching only when birth date is absent.",
  },
  fieldWorkCity: {
    key: "fieldWorkCity",
    label: "Work City",
    description: "Where the person works — used to match nearby groups.",
  },
  fieldLanguage: {
    key: "fieldLanguage",
    label: "Language",
    description: "Languages the person is comfortable with.",
  },
  fieldSchedule: {
    key: "fieldSchedule",
    label: "Schedule / availability",
    description: "Which day and time window the person is free to meet.",
  },
  fieldMeetingPreference: {
    key: "fieldMeetingPreference",
    label: "Meeting Preference",
    description: "Online, Hybrid, or In-person.",
  },
}

export const FORM_OPTION_META: Record<FormOptionKey, FormToggleMeta> = {
  familySpouseOnly: {
    key: "familySpouseOnly",
    label: "Spouse only",
    description:
      "Ask only about a spouse, not children or other household members. Useful when the point is couples eligibility rather than a full family roster.",
  },
}

export const FORM_CONTEXT_META: Record<
  FormContext,
  { context: FormContext; label: string; description: string }
> = {
  Register: {
    context: "Register",
    label: "Register",
    description: "The public registration link people fill in ahead of the event.",
  },
  WalkIn: {
    context: "WalkIn",
    label: "Walk-in",
    description: "Registration at the door, run by staff at the check-in kiosk.",
  },
  CheckIn: {
    context: "CheckIn",
    label: "Check-in",
    description: "The attendance surface people use on the day of the event.",
  },
}

// ─── Form layout ─────────────────────────────────────────────────────────────

/**
 * Where each toggle actually lives in the public form.
 *
 * This is the **single source of truth** for the builder's shape, and it mirrors
 * the real step order of the form it configures — `sections` in
 * `app/events/[id]/register/registration-form.tsx` for Register/Walk-in, and the
 * profile step in `checkin-board.tsx` for Check-in.
 *
 * It exists because a flat list of section toggles next to a flat list of field
 * toggles tells an admin nothing about which fields appear where: five of the
 * eight fields only render inside the DGroup step, and Check-in has a different
 * shape entirely. Grouping the builder by section makes the config legible, and
 * pinning the grouping here (rather than in the component) lets tests assert it
 * against the form.
 *
 * `key: "personal"` is the identity step — always present, not toggleable, since
 * name plus mobile/email is the "bare" form.
 */
export type FormLayoutSection = {
  key: FormSectionKey | "personal"
  /** Heading as it appears to the person filling the form. */
  title: string
  description: string
  fields: readonly FormFieldKey[]
  options: readonly FormOptionKey[]
  /** Extra context shown in the builder — e.g. what a field-less section adds. */
  note?: string
}

const REGISTER_LAYOUT: readonly FormLayoutSection[] = [
  {
    key: "personal",
    title: "Personal Information",
    description: "Name, mobile number and email are always collected.",
    fields: ["fieldLifeStage", "fieldBirthDate", "fieldAgeRange", "fieldGender"],
    options: [],
  },
  {
    key: "sectionSmallGroup",
    title: "DGroup Info",
    description: FORM_SECTION_META.sectionSmallGroup.description,
    fields: ["fieldLanguage", "fieldMeetingPreference", "fieldSchedule", "fieldWorkCity"],
    options: [],
    note: "These are asked only of someone who says they're looking for a group. Life Stage moved to Personal Information, so it's asked either way.",
  },
  {
    key: "sectionBreakout",
    title: "Breakout Group",
    description: FORM_SECTION_META.sectionBreakout.description,
    fields: [],
    options: [],
    note: "Adds a step for picking a breakout group. No extra fields.",
  },
  {
    key: "sectionFamily",
    title: "Your Household",
    description: FORM_SECTION_META.sectionFamily.description,
    fields: [],
    options: ["familySpouseOnly"],
    note: "Each household member is asked for the Personal Information fields enabled above.",
  },
  {
    key: "sectionDietary",
    title: "Dietary Preferences",
    description: FORM_SECTION_META.sectionDietary.description,
    fields: [],
    options: [],
    note: "Adds a dietary preference picker, plus a free-text note when Other is chosen.",
  },
  {
    key: "sectionPayment",
    title: "Payment",
    description: FORM_SECTION_META.sectionPayment.description,
    fields: [],
    options: [],
    note: "Adds a payment reference input on the final step.",
  },
]

/**
 * Check-in has its own shape: the profile step asks every matching field directly,
 * with no DGroup dependency, and it never asks for birth date. Payment and
 * breakout selection don't apply at all (see `NOT_APPLICABLE` in the builder).
 */
const CHECKIN_LAYOUT: readonly FormLayoutSection[] = [
  {
    key: "personal",
    title: "Their details",
    description:
      "Shown when someone checks in for the first time, so their profile can be filled in.",
    fields: [
      "fieldLifeStage",
      "fieldAgeRange",
      "fieldGender",
      "fieldLanguage",
      "fieldMeetingPreference",
      "fieldSchedule",
      "fieldWorkCity",
    ],
    options: [],
  },
  {
    key: "sectionSmallGroup",
    title: "DGroup prompt",
    description: FORM_SECTION_META.sectionSmallGroup.description,
    fields: [],
    options: [],
    note: "Asks whether they're already in a DGroup. No extra fields.",
  },
  {
    key: "sectionFamily",
    title: "Household check-in",
    description: FORM_SECTION_META.sectionFamily.description,
    fields: [],
    options: ["familySpouseOnly"],
    note: "Surfaces the whole household so they can be checked in together, and allows adding a member at the door.",
  },
]

export function formLayoutFor(context: FormContext): readonly FormLayoutSection[] {
  return context === "CheckIn" ? CHECKIN_LAYOUT : REGISTER_LAYOUT
}

/**
 * The section a field is nested under in this context, or null when it sits in the
 * always-on identity step. Derived from the layout so there is only one list.
 */
export function parentSectionFor(
  field: FormFieldKey,
  context: FormContext,
): FormSectionKey | null {
  for (const section of formLayoutFor(context)) {
    if (!section.fields.includes(field)) continue
    return section.key === "personal" ? null : section.key
  }
  return null
}

// ─── Legacy derivation ───────────────────────────────────────────────────────

export type LegacyFormToggles = {
  formIncludeSmallGroup: boolean
  formIncludeDietary: boolean
  formIncludePayment: boolean
  autoAssignBreakout: boolean
}

/**
 * The pre-CCF-119 effective behavior of a context, derived from the flat
 * `Event.formInclude*` columns. This mirrors the backfill in
 * `20260727000000_add_event_form_config` one-for-one and exists so that mapping
 * stays pinned by tests rather than living only in SQL.
 *
 * Notes on the mapping:
 *  - Register and Walk-in rendered the same component with the same props
 *    (walk-ins go through `/events/[id]/register?checkin=…`), so they match.
 *  - Birth date and Gender were rendered unconditionally in Personal
 *    Information, independent of any toggle.
 *  - The matching fields only appeared inside the DGroup section.
 *  - Breakout selection had no toggle — it appeared whenever the event was not
 *    in auto-assign mode (and candidates existed, which stays a runtime check).
 *  - Check-in only surfaced the DGroup prompt + matching profile; it never
 *    collected dietary, payment, or birth date.
 */
export function deriveLegacyEventFormConfig(
  legacy: LegacyFormToggles,
  context: FormContext,
): EventFormConfigData {
  const sg = legacy.formIncludeSmallGroup
  const isCheckIn = context === "CheckIn"
  return {
    sectionSmallGroup: sg,
    sectionBreakout: isCheckIn ? false : !legacy.autoAssignBreakout,
    sectionDietary: isCheckIn ? false : legacy.formIncludeDietary,
    sectionPayment: isCheckIn ? false : legacy.formIncludePayment,
    sectionFamily: false,
    fieldLifeStage: sg,
    fieldGender: isCheckIn ? sg : true,
    fieldBirthDate: isCheckIn ? false : true,
    fieldAgeRange: false,
    fieldWorkCity: sg,
    fieldLanguage: sg,
    fieldSchedule: sg,
    fieldMeetingPreference: sg,
    familySpouseOnly: false,
  }
}
