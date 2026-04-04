import { z } from "zod"

const nullableString = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : v.trim()))

export const ministrySchema = z.object({
  name: z.string().min(1, "Name is required").trim(),
  lifeStageId: nullableString,
  description: nullableString,
})

export type MinistryInput = z.infer<typeof ministrySchema>

export type MinistryFormValues = {
  name: string
  lifeStageId: string
  description: string
}

export const defaultMinistryForm: MinistryFormValues = {
  name: "",
  lifeStageId: "",
  description: "",
}
