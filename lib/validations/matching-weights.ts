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
  { key: "lifeStage", label: "Life Stage", description: "Match by member's life stage" },
  { key: "gender", label: "Gender", description: "Match by gender focus" },
  { key: "language", label: "Language", description: "Match by preferred language" },
  { key: "age", label: "Age", description: "Match by age range" },
  { key: "schedule", label: "Schedule", description: "Match by availability windows" },
  { key: "location", label: "Location", description: "Match by work city" },
  { key: "mode", label: "Meeting Mode", description: "Match by in-person/online preference" },
  { key: "career", label: "Career", description: "Match by work industry" },
  { key: "capacity", label: "Capacity", description: "Favour groups with more open slots" },
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
