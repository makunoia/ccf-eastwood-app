import { z } from "zod"

const nullableString = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : v.trim()))

const hexColor = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : v.trim()))
  .refine((v) => v == null || /^#[0-9A-Fa-f]{6}$/.test(v), {
    message: "Must be a valid hex color (e.g. #4F46E5)",
  })

export const ministrySchema = z.object({
  name: z.string().min(1, "Name is required").trim(),
  lifeStageId: nullableString,
  description: nullableString,
  logoUrl: nullableString,
  themeColorPrimary: hexColor,
  themeColorSecondary: hexColor,
  themeColorAccent: hexColor,
})

export type MinistryInput = z.infer<typeof ministrySchema>

export type MinistryFormValues = {
  name: string
  lifeStageId: string
  description: string
  logoUrl: string
  themeColorPrimary: string
  themeColorSecondary: string
  themeColorAccent: string
}

export const defaultMinistryForm: MinistryFormValues = {
  name: "",
  lifeStageId: "",
  description: "",
  logoUrl: "",
  themeColorPrimary: "",
  themeColorSecondary: "",
  themeColorAccent: "",
}
