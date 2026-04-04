import { z } from "zod"

export const smallGroupStatusSchema = z.object({
  name: z.string().min(1, "Name is required").trim(),
  order: z.coerce.number().int().min(0, "Order must be 0 or greater"),
})

export type SmallGroupStatusInput = z.infer<typeof smallGroupStatusSchema>

export type SmallGroupStatusFormValues = {
  name: string
  order: string
}

export const defaultSmallGroupStatusForm: SmallGroupStatusFormValues = {
  name: "",
  order: "",
}
