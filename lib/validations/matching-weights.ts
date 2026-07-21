import { z } from "zod"

const weightField = z.coerce
  .number()
  .min(0, "Must be at least 0")
  .max(1, "Must be at most 1")

export const matchingWeightsSchema = z.object({
  lifeStage: weightField,
  gender: weightField,
  language: weightField,
  age: weightField,
  schedule: weightField,
  location: weightField,
  mode: weightField,
  career: weightField,
  capacity: weightField,
})

export type MatchingWeightsFormValues = z.infer<typeof matchingWeightsSchema>
export type WeightKey = keyof MatchingWeightsFormValues

/**
 * Life stage, gender and schedule are hard eligibility GATES, not weighted
 * factors: a group that fails one is excluded before scoring runs, so at
 * scoring time those factors can only ever be a pass. Their weights would
 * therefore do nothing, so they are deliberately kept out of the tunable set
 * and pinned to 0. The engine scores and normalises over ACTIVE_WEIGHT_KEYS
 * only; the three columns are retained so re-promoting a gate later is a
 * one-line change here rather than a schema migration.
 */
export const GATE_WEIGHT_KEYS = ["lifeStage", "gender", "schedule"] as const
export const ACTIVE_WEIGHT_KEYS = [
  "language",
  "age",
  "location",
  "mode",
  "career",
  "capacity",
] as const

export type ActiveWeightKey = (typeof ACTIVE_WEIGHT_KEYS)[number]
export type GateWeightKey = (typeof GATE_WEIGHT_KEYS)[number]

type FieldMeta<K extends WeightKey = WeightKey> = { key: K; label: string; description: string }

/** The six weighted factors admins can tune. */
export const ACTIVE_WEIGHT_FIELDS: FieldMeta<ActiveWeightKey>[] = [
  { key: "language", label: "Language", description: "Shared language (Filipino, English…)" },
  { key: "age", label: "Age Range", description: "Actual age fit within the group's range" },
  { key: "location", label: "Work Location", description: "Groups near where they work" },
  { key: "mode", label: "Meeting Format", description: "In-person, online, or hybrid preference" },
  { key: "career", label: "Work Industry", description: "People with similar work backgrounds" },
  { key: "capacity", label: "Group Availability", description: "Prefer groups with open spots" },
]

/** The three hard requirements — shown for context, not tunable. */
export const GATE_FIELDS: FieldMeta<GateWeightKey>[] = [
  { key: "lifeStage", label: "Life Stage", description: "Required — groups for a different life stage are excluded entirely." },
  { key: "gender", label: "Gender Focus", description: "Required — a men's or women's group excludes the other." },
  { key: "schedule", label: "Meeting Schedule", description: "Required — groups meeting when the person can't attend are excluded." },
]

/**
 * All nine factors in canonical display order (gates first). Kept as a single
 * exported list so existing importers keep resolving every key.
 */
export const WEIGHT_FIELDS: FieldMeta[] = [...GATE_FIELDS, ...ACTIVE_WEIGHT_FIELDS]

// Days a small group is excluded from guest match suggestions after receiving
// a guest assignment. 0 disables the cooldown.
export const DEFAULT_GUEST_COOLDOWN_DAYS = 7

export const guestCooldownDaysSchema = z.coerce
  .number()
  .int("Must be a whole number")
  .min(0, "Must be at least 0")
  .max(365, "Must be at most 365")

/**
 * Nine-key object because the DB columns are non-nullable with no default and
 * `create: { ...DEFAULT_WEIGHTS }` needs every column. Gate keys are 0 (they
 * carry no weight); the six active weights sum to 1.0.
 */
export const DEFAULT_WEIGHTS: MatchingWeightsFormValues = {
  lifeStage: 0,
  gender: 0,
  schedule: 0,
  age: 0.25,
  language: 0.2,
  location: 0.2,
  capacity: 0.15,
  mode: 0.1,
  career: 0.1,
}
