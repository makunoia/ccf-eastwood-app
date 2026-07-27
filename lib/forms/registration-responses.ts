import {
  FORM_CONTEXTS,
  FORM_FIELD_KEYS,
  FORM_FIELD_META,
  FORM_SECTION_META,
  FORM_TOGGLE_KEYS,
  type EventFormConfigData,
  type FormFieldKey,
  type FormSectionKey,
} from "./context-config"
import type { FormContext } from "@/app/generated/prisma/client"

/**
 * What a registrant actually told us, filtered by what the event's form asks for.
 *
 * Two rules, both deliberate:
 *
 * 1. **Union across contexts.** We don't record which surface someone came
 *    through (Register / Walk-in / Check-in), so a field is considered "asked"
 *    if *any* context collects it. Using one context's config would hide data
 *    legitimately gathered by another.
 *
 * 2. **A value is never hidden.** A field that holds data is always shown, even
 *    if its toggle has since been turned off. The alternative — flipping a
 *    toggle making previously-collected answers invisible in the admin UI —
 *    would look like data loss. Such a row is marked `stillCollected: false` so
 *    the UI can note the form no longer asks for it.
 *
 * An enabled field with no answer renders as "—", which is useful: it shows the
 * question was asked and skipped, rather than never asked.
 */

export type ResponseRow = {
  key: string
  label: string
  /** Display-ready value; null renders as "—". */
  value: string | null
  /** False when the form no longer asks this but an answer exists. */
  stillCollected: boolean
}

export type RegistrationFieldValues = Record<FormFieldKey, string | null>

export type RegistrationSectionValues = Partial<Record<FormSectionKey, string | null>>

/** OR-union of every context's config — see rule 1. */
export function mergeFormConfigs(
  configs: Partial<Record<FormContext, EventFormConfigData>>
): EventFormConfigData {
  return Object.fromEntries(
    FORM_TOGGLE_KEYS.map((key) => [
      key,
      FORM_CONTEXTS.some((context) => configs[context]?.[key] === true),
    ])
  ) as EventFormConfigData
}

function buildRows<K extends string>(
  keys: readonly K[],
  config: EventFormConfigData,
  values: Partial<Record<K, string | null>>,
  label: (key: K) => string
): ResponseRow[] {
  return keys.flatMap((key) => {
    const value = values[key] ?? null
    const enabled = config[key as keyof EventFormConfigData] === true
    // Not asked and nothing stored → nothing to say.
    if (!enabled && value === null) return []
    return [{ key, label: label(key), value, stillCollected: enabled }]
  })
}

/** Personal-information answers, in the order the form asks them. */
export function buildRegistrationFieldRows(
  config: EventFormConfigData,
  values: Partial<RegistrationFieldValues>
): ResponseRow[] {
  return buildRows(FORM_FIELD_KEYS, config, values, (key) => FORM_FIELD_META[key].label)
}

/** Section-level answers (dietary, payment, DGroup intent, household). */
export function buildRegistrationSectionRows(
  config: EventFormConfigData,
  values: RegistrationSectionValues
): ResponseRow[] {
  // Breakout placement has its own dedicated section on the detail page.
  const keys = (["sectionSmallGroup", "sectionDietary", "sectionPayment", "sectionFamily"] as const)
  return buildRows(keys, config, values, (key) => FORM_SECTION_META[key].label)
}

// ─── Value formatting ────────────────────────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export function formatBirthDate(month: number | null, year: number | null): string | null {
  if (month == null && year == null) return null
  const monthName = month != null ? MONTHS[month - 1] ?? String(month) : null
  return [monthName, year != null ? String(year) : null].filter(Boolean).join(" ") || null
}

const MEETING_PREFERENCE_LABELS: Record<string, string> = {
  Online: "Online",
  Hybrid: "Hybrid",
  InPerson: "In Person",
}

export function formatMeetingPreference(value: string | null): string | null {
  if (!value) return null
  return MEETING_PREFERENCE_LABELS[value] ?? value
}

export function formatLanguages(language: string[] | null | undefined): string | null {
  if (!language || language.length === 0) return null
  return language.join(", ")
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export function formatSchedule(
  dayOfWeek: number | null,
  timeStart: string | null,
  timeEnd: string | null
): string | null {
  if (dayOfWeek == null && !timeStart) return null
  const day = dayOfWeek != null ? DAY_NAMES[dayOfWeek] ?? null : null
  const window = [timeStart, timeEnd].filter(Boolean).join(" – ")
  return [day, window].filter(Boolean).join(", ") || null
}

const DIETARY_LABELS: Record<string, string> = {
  Vegetarian: "Vegetarian",
  Vegan: "Vegan",
  Halal: "Halal",
  Kosher: "Kosher",
  GlutenFree: "Gluten-Free",
  DairyFree: "Dairy-Free",
  NutFree: "Nut-Free",
  Pescatarian: "Pescatarian",
  Other: "Other",
}

export function formatDietary(
  preference: string | null,
  other: string | null
): string | null {
  if (!preference) return null
  const label = DIETARY_LABELS[preference] ?? preference
  return preference === "Other" && other ? `${label} — ${other}` : label
}

export function formatPayment(isPaid: boolean, reference: string | null): string | null {
  if (!isPaid && !reference) return null
  const state = isPaid ? "Paid" : "Unpaid"
  return reference ? `${state} — ${reference}` : state
}
