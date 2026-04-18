import { z } from "zod"

const nullableString = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : v.trim()))

const nullableInt = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : parseInt(v, 10)))
  .pipe(z.number().int().positive().nullable())

const nullableDay = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : parseInt(v, 10)))
  .pipe(z.number().int().min(0).max(6).nullable())

const nullableTime = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : v))
  .pipe(z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format").nullable())

export const smallGroupSchema = z.object({
  name: z.string().min(1, "Group name is required").trim(),
  leaderId: z.string().min(1, "Leader is required"),
  parentGroupId: nullableString,
  lifeStageId: z.string().min(1, "Life stage is required").trim(),
  genderFocus: z.enum(["Male", "Female", "Mixed"], {
    errorMap: () => ({ message: "Gender focus is required" }),
  }),
  language: z.array(z.string()).default([]),
  ageRangeMin: nullableInt,
  ageRangeMax: nullableInt,
  meetingFormat: z.enum(["Online", "Hybrid", "InPerson"], {
    errorMap: () => ({ message: "Meeting format is required" }),
  }),
  locationCity: nullableString,
  memberLimit: nullableInt,
  scheduleDayOfWeek: z
    .string()
    .min(1, "Meeting day is required")
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(0).max(6)),
  scheduleTimeStart: z
    .string()
    .min(1, "Start time is required")
    .regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  scheduleTimeEnd: z
    .string()
    .min(1, "End time is required")
    .regex(/^\d{2}:\d{2}$/, "Invalid time format"),
})

export type SmallGroupInput = z.infer<typeof smallGroupSchema>

// Raw form values (before transform) — used as the form state type
export type SmallGroupFormValues = {
  name: string
  leaderId: string
  parentGroupId: string
  lifeStageId: string
  genderFocus: string
  language: string[]
  ageRangeMin: string
  ageRangeMax: string
  meetingFormat: string
  locationCity: string
  memberLimit: string
  scheduleDayOfWeek: string  // "0"–"6" or ""
  scheduleTimeStart: string  // "HH:MM" or ""
  scheduleTimeEnd: string    // "HH:MM" or ""
}

export const defaultSmallGroupForm: SmallGroupFormValues = {
  name: "",
  leaderId: "",
  parentGroupId: "",
  lifeStageId: "",
  genderFocus: "",
  language: [],
  ageRangeMin: "",
  ageRangeMax: "",
  meetingFormat: "",
  locationCity: "",
  memberLimit: "",
  scheduleDayOfWeek: "",
  scheduleTimeStart: "",
  scheduleTimeEnd: "",
}
