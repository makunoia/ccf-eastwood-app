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

export const WEIGHT_FIELDS: Array<{
  key: keyof MatchingWeightsFormValues
  label: string
  description: string
}> = [
  { key: "lifeStage", label: "Life Stage", description: "Young adults, families, seniors, etc." },
  { key: "gender", label: "Gender Focus", description: "Men's, women's, or mixed groups" },
  { key: "language", label: "Language", description: "Shared language (Filipino, English…)" },
  { key: "age", label: "Age Range", description: "Actual age fit within the group's range" },
  { key: "schedule", label: "Meeting Schedule", description: "Can the person attend the meeting time?" },
  { key: "location", label: "Work Location", description: "Groups near where they work" },
  { key: "mode", label: "Meeting Format", description: "In-person, online, or hybrid preference" },
  { key: "career", label: "Work Industry", description: "People with similar work backgrounds" },
  { key: "capacity", label: "Group Availability", description: "Prefer groups with open spots" },
]

export const DEFAULT_WEIGHTS: MatchingWeightsFormValues = {
  lifeStage: 0.20,
  gender: 0.10,
  language: 0.10,
  age: 0.15,
  schedule: 0.15,
  location: 0.10,
  mode: 0.05,
  career: 0.05,
  capacity: 0.10,
}
