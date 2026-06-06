import { z } from "zod"
import { formatPhilippinePhone } from "@/lib/utils"

const nullableString = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : v.trim()))

// Always normalize mobile numbers to the canonical "+63 XXX XXX XXXX" stored
// format before persisting — see "Mobile number format" in CLAUDE.md.
const nullablePhone = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : formatPhilippinePhone(v.trim())))

const nullableEmail = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : v.trim()))
  .refine((v) => v == null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: "Invalid email address",
  })

const nullableInt = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === "" || v == null) return null
    const n = Number(v)
    return isNaN(n) ? null : n
  })

export const guestSchema = z.object({
  firstName: z.string().min(1, "First name is required").trim(),
  lastName: z.string().min(1, "Last name is required").trim(),
  nickname: nullableString,
  email: nullableEmail,
  phone: nullablePhone,
  notes: nullableString,
  lifeStageId: nullableString,
  gender: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(["Male", "Female"]).optional().nullable()
  ),
  language: z.string().array().default([]),
  birthMonth: nullableInt,
  birthYear: nullableInt,
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
  nickname?: string
  email: string
  phone: string
  notes: string
  lifeStageId: string
  gender: string
  language: string[]
  birthMonth: string
  birthYear: string
  workCity: string
  workIndustry: string
  meetingPreference: string
}

export const defaultGuestForm: GuestFormValues = {
  firstName: "",
  lastName: "",
  nickname: "",
  email: "",
  phone: "",
  notes: "",
  lifeStageId: "",
  gender: "",
  language: [],
  birthMonth: "",
  birthYear: "",
  workCity: "",
  workIndustry: "",
  meetingPreference: "",
}
