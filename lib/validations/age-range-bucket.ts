import { z } from "zod"

/**
 * Age Range buckets (CCF-123). Both bounds are inclusive and optional: an empty
 * `minAge` reads as "and under", an empty `maxAge` as "and over", so the first
 * and last buckets stay open-ended.
 */
export const ageRangeBucketSchema = z
  .object({
    label: z.string().min(1, "Label is required").trim(),
    minAge: z
      .union([z.literal(""), z.coerce.number().int().min(0).max(150)])
      .transform((v) => (v === "" ? null : v)),
    maxAge: z
      .union([z.literal(""), z.coerce.number().int().min(0).max(150)])
      .transform((v) => (v === "" ? null : v)),
    order: z.coerce.number().int().min(0, "Order must be 0 or greater"),
  })
  .refine((v) => v.minAge !== null || v.maxAge !== null, {
    message: "Set a minimum age, a maximum age, or both",
    path: ["minAge"],
  })
  .refine((v) => v.minAge === null || v.maxAge === null || v.minAge <= v.maxAge, {
    message: "Minimum age cannot be greater than maximum age",
    path: ["minAge"],
  })

export type AgeRangeBucketInput = z.infer<typeof ageRangeBucketSchema>

export type AgeRangeBucketFormValues = {
  label: string
  minAge: string
  maxAge: string
  order: string
}

export const defaultAgeRangeBucketForm: AgeRangeBucketFormValues = {
  label: "",
  minAge: "",
  maxAge: "",
  order: "",
}

/** Human-readable range, e.g. "Under 18", "18 – 29", "60+". */
export function formatAgeRange(minAge: number | null, maxAge: number | null): string {
  if (minAge === null && maxAge === null) return "Any age"
  if (minAge === null) return `Under ${(maxAge as number) + 1}`
  if (maxAge === null) return `${minAge}+`
  return `${minAge} – ${maxAge}`
}
