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

const nullableInt = z
  .string()
  .optional()
  .transform((v) => {
    if (v === "" || v == null) return null
    const n = parseInt(v, 10)
    return isNaN(n) ? null : n
  })

export const eventSchema = z
  .object({
    name: z.string().min(1, "Name is required").trim(),
    description: nullableString,
    ministryId: z.string().min(1, "Ministry is required"),
    type: z.enum(["OneTime", "MultiDay", "Recurring"]),
    startDate: z.string().min(1, "Start date is required").transform((v) => new Date(v)),
    endDate: z.string().optional().transform((v) => (v === "" || v == null ? null : new Date(v))),
    price: nullablePrice,
    registrationStart: nullableDate,
    registrationEnd: nullableDate,
    recurrenceDayOfWeek: nullableInt,
    recurrenceFrequency: z
      .string()
      .optional()
      .transform((v) =>
        v === "" || v == null ? null : v
      ) as z.ZodType<"Weekly" | "Biweekly" | "Monthly" | null>,
    recurrenceEndDate: nullableDate,
  })
  .superRefine((data, ctx) => {
    if (data.type === "MultiDay" && !data.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date is required for multi-day events",
      })
    }
    if (data.type === "Recurring") {
      if (data.recurrenceDayOfWeek == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["recurrenceDayOfWeek"],
          message: "Day of week is required for recurring events",
        })
      }
      if (!data.recurrenceFrequency) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["recurrenceFrequency"],
          message: "Frequency is required for recurring events",
        })
      }
    }
  })

export type EventInput = z.infer<typeof eventSchema>

export type EventFormValues = {
  name: string
  description: string
  ministryId: string
  type: "OneTime" | "MultiDay" | "Recurring"
  startDate: string
  endDate: string
  price: string
  registrationStart: string
  registrationEnd: string
  recurrenceDayOfWeek: string
  recurrenceFrequency: string
  recurrenceEndDate: string
}

export const defaultEventForm: EventFormValues = {
  name: "",
  description: "",
  ministryId: "",
  type: "OneTime",
  startDate: "",
  endDate: "",
  price: "",
  registrationStart: "",
  registrationEnd: "",
  recurrenceDayOfWeek: "",
  recurrenceFrequency: "",
  recurrenceEndDate: "",
}
