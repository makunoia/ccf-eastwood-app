import { z } from "zod"

const nullableString = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : v.trim()))

const nullableDate = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : new Date(v)))

// Price comes in as a decimal string (e.g. "2500.00" = PHP 2500)
// stored as cents (integer). Empty = free (null).
const nullablePrice = z
  .string()
  .optional()
  .transform((v) => {
    if (v === "" || v == null) return null
    const n = parseFloat(v)
    if (isNaN(n) || n < 0) return null
    return Math.round(n * 100)
  })

export const eventSchema = z.object({
  name: z.string().min(1, "Name is required").trim(),
  description: nullableString,
  ministryId: z.string().min(1, "Ministry is required"),
  startDate: z.string().min(1, "Start date is required").transform((v) => new Date(v)),
  endDate: z.string().min(1, "End date is required").transform((v) => new Date(v)),
  price: nullablePrice,
  registrationStart: nullableDate,
  registrationEnd: nullableDate,
})

export type EventInput = z.infer<typeof eventSchema>

export type EventFormValues = {
  name: string
  description: string
  ministryId: string
  startDate: string
  endDate: string
  price: string
  registrationStart: string
  registrationEnd: string
}

export const defaultEventForm: EventFormValues = {
  name: "",
  description: "",
  ministryId: "",
  startDate: "",
  endDate: "",
  price: "",
  registrationStart: "",
  registrationEnd: "",
}
