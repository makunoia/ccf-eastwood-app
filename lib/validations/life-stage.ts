import { z } from "zod"

export const lifeStageSchema = z.object({
  name: z.string().min(1, "Name is required").trim(),
  order: z.coerce.number().int().min(0, "Order must be 0 or greater"),
})

export type LifeStageInput = z.infer<typeof lifeStageSchema>

export type LifeStageFormValues = {
  name: string
  order: string
}

export const defaultLifeStageForm: LifeStageFormValues = {
  name: "",
  order: "",
}
