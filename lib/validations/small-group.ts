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

export const smallGroupSchema = z.object({
  name: z.string().min(1, "Group name is required").trim(),
  leaderId: z.string().min(1, "Leader is required"),
  parentGroupId: nullableString,
  groupType: z
    .preprocess((v) => (v === "" || v == null ? "Regular" : v), z.enum(["Regular", "Couples"])),
  lifeStageIds: z.array(z.string()).min(1, "At least one life stage is required"),
  genderFocus: z.enum(["Male", "Female", "Mixed"]),
  language: z.array(z.string()).default([]),
  ageRangeMin: nullableInt,
  ageRangeMax: nullableInt,
  meetingFormat: z.enum(["Online", "Hybrid", "InPerson"]),
  locationCity: nullableString,
  memberLimit: nullableInt,
  scheduleDayOfWeek: z
    .string()
    .min(1, "Meeting day is required")
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(0).max(6)),
  scheduleTimeStart: z
    .string()
    .min(1, "Meeting start time is required")
    .regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  scheduleTimeEnd: z
    .string()
    .min(1, "Meeting end time is required")
    .regex(/^\d{2}:\d{2}$/, "Invalid time format"),
}).refine(
  (data) => data.scheduleTimeStart < data.scheduleTimeEnd,
  { message: "End time must be after start time", path: ["scheduleTimeEnd"] }
).transform((data) =>
  // Couples groups host married pairs — gender focus is always Mixed.
  data.groupType === "Couples" ? { ...data, genderFocus: "Mixed" as const } : data
)

export type SmallGroupInput = z.infer<typeof smallGroupSchema>

// Raw form values (before transform) — used as the form state type
export type SmallGroupFormValues = {
  name: string
  leaderId: string
  parentGroupId: string
  groupType: string
  lifeStageIds: string[]
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
  groupType: "Regular",
  lifeStageIds: [],
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
