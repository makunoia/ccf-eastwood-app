import { z } from "zod"
import type { EventModuleType } from "@/app/generated/prisma/client"

const nullableString = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : v.trim()))

const nullableDate = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : new Date(v)))

const nullableInt = z
  .string()
  .optional()
  .transform((v) => {
    if (v === "" || v == null) return null
    const n = parseInt(v, 10)
    return isNaN(n) ? null : n
  })

/**
 * The event's own facts. Price and the registration window are deliberately absent:
 * price belongs to the Priced module (Settings → Modules) and the window to the
 * registration form (Forms → Registration Form), each with its own action. Keeping
 * them here would mean every Details save rewrites fields the form no longer shows,
 * silently clearing them.
 */
export const eventSchema = z
  .object({
    name: z.string().min(1, "Name is required").trim(),
    description: nullableString,
    ministryIds: z.array(z.string()).optional().default([]),
    allMinistries: z.boolean().optional().default(false),
    type: z.enum(["OneTime", "MultiDay", "Recurring"]),
    startDate: z.string().min(1, "Start date is required").transform((v) => new Date(v)),
    endDate: z.string().optional().transform((v) => (v === "" || v == null ? null : new Date(v))),
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

/**
 * The Priced module's fee. Comes in as a decimal string ("2500.00" = PHP 2500) and
 * is stored as cents. Required — an event can only be priced with a price, and
 * disabling the module is what makes it free again.
 */
export const eventPriceSchema = z.object({
  price: z
    .string()
    .trim()
    .min(1, "Price is required")
    .refine((v) => {
      const n = parseFloat(v)
      return !isNaN(n) && n > 0
    }, "Enter a price greater than zero")
    .transform((v) => Math.round(parseFloat(v) * 100)),
})

export type EventPriceInput = z.infer<typeof eventPriceSchema>

/**
 * The public registration window. Both bounds optional — a blank side is unbounded,
 * matching `isWithinRegistrationWindow`.
 */
export const registrationWindowSchema = z
  .object({
    registrationStart: nullableDate,
    registrationEnd: nullableDate,
  })
  .superRefine((data, ctx) => {
    if (
      data.registrationStart &&
      data.registrationEnd &&
      data.registrationEnd < data.registrationStart
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["registrationEnd"],
        message: "Registration must close on or after it opens",
      })
    }
  })

export type RegistrationWindowInput = z.infer<typeof registrationWindowSchema>

export type RegistrationWindowValues = {
  registrationStart: string
  registrationEnd: string
}

/**
 * The modules an event starts with, chosen on the create form (CCF-131).
 *
 * Separate from `EventFormValues` because it isn't an event fact — it's a set of
 * `EventModule` rows plus, when Priced is among them, the fee that module needs.
 * `price` is ignored unless the resolved selection includes Priced.
 */
export type EventModuleSelection = {
  types: EventModuleType[]
  price: string
}

export const defaultModuleSelection: EventModuleSelection = {
  types: [],
  price: "",
}

const requiredDate = z
  .string()
  .min(1, "Date is required")
  .transform((value) => new Date(`${value}T00:00:00.000Z`))

const nullableId = z
  .string()
  .nullable()
  .optional()
  .transform((value) => (value === "" || value == null ? null : value))

export const occurrenceSeriesSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    startDate: requiredDate,
    endDate: requiredDate,
  })
  .superRefine((data, ctx) => {
    if (data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be on or after the start date",
      })
    }
  })

export type OccurrenceSeriesInput = z.infer<typeof occurrenceSeriesSchema>

export const occurrenceFormSchema = z.object({
  date: requiredDate,
  isStandalone: z.boolean().default(false),
  seriesId: nullableId,
})

export type OccurrenceFormInput = z.infer<typeof occurrenceFormSchema>

export const occurrenceGroupingSchema = z.object({
  isStandalone: z.boolean().default(false),
  seriesId: nullableId,
})

export type OccurrenceGroupingInput = z.infer<typeof occurrenceGroupingSchema>

export type EventFormValues = {
  name: string
  description: string
  ministryIds: string[]
  allMinistries: boolean
  type: "OneTime" | "MultiDay" | "Recurring"
  startDate: string
  endDate: string
  recurrenceDayOfWeek: string
  recurrenceFrequency: string
  recurrenceEndDate: string
}

export const defaultEventForm: EventFormValues = {
  name: "",
  description: "",
  ministryIds: [],
  allMinistries: false,
  type: "OneTime",
  startDate: "",
  endDate: "",
  recurrenceDayOfWeek: "",
  recurrenceFrequency: "",
  recurrenceEndDate: "",
}
