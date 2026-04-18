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

const nullableInt = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === "" || v == null) return null
    const n = Number(v)
    return isNaN(n) ? null : n
  })

export const memberSchema = z.object({
  firstName: z.string().min(1, "First name is required").trim(),
  lastName: z.string().min(1, "Last name is required").trim(),
  email: nullableEmail,
  phone: nullableString,
  address: nullableString,
  dateJoined: z
    .string()
    .min(1, "Date joined is required")
    .transform((v) => new Date(v)),
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

export type MemberInput = z.infer<typeof memberSchema>

// Raw form values (before transform) — used as the form state type
export type MemberFormValues = {
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  dateJoined: string
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

export const defaultMemberForm: MemberFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  dateJoined: new Date().toISOString().split("T")[0],
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
