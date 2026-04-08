import { z } from "zod"

const nullableString = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : v.trim()))

const nullableEmail = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : v.trim()))
  .refine((v) => v == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: "Invalid email address",
  })

const nullableDate = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : new Date(v)))

export const guestSchema = z.object({
  firstName: z.string().min(1, "First name is required").trim(),
  lastName: z.string().min(1, "Last name is required").trim(),
  email: nullableEmail,
  phone: nullableString,
  notes: nullableString,
  lifeStageId: nullableString,
  gender: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(["Male", "Female"]).optional().nullable()
  ),
  language: nullableString,
  birthDate: nullableDate,
  workCity: nullableString,
  workIndustry: nullableString,
  meetingPreference: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(["Online", "Hybrid", "InPerson"]).optional().nullable()
  ),
})

export type GuestInput = z.infer<typeof guestSchema>

export type GuestFormValues = {
  firstName: string
  lastName: string
  email: string
  phone: string
  notes: string
  lifeStageId: string
  gender: string
  language: string
  birthDate: string
  workCity: string
  workIndustry: string
  meetingPreference: string
}

export const defaultGuestForm: GuestFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  notes: "",
  lifeStageId: "",
  gender: "",
  language: "",
  birthDate: "",
  workCity: "",
  workIndustry: "",
  meetingPreference: "",
}
