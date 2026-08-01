import { z } from "zod"

/**
 * The matching profile a person can fill in about themselves — the fields the
 * scoring engine reads when suggesting a DGroup.
 *
 * Shared by guests and members: the two records hold the same answers, they just
 * store the schedule differently (a guest keeps one inline slot, a member owns
 * `SchedulePreference` rows). Lives here rather than in a `"use server"` action
 * file so both the admin actions and the public check-in kiosk can validate
 * against one schema.
 */
export const matchingProfileSchema = z.object({
  lifeStageId: z.string().nullable().optional(),
  gender: z.enum(["Male", "Female"]).nullable().optional(),
  language: z.array(z.string()).optional(),
  meetingPreference: z.enum(["Online", "Hybrid", "InPerson"]).nullable().optional(),
  workCity: z.string().nullable().optional(),
  workIndustry: z.string().nullable().optional(),
  birthMonth: z.number().int().min(1).max(12).nullable().optional(),
  birthYear: z.number().int().min(1900).nullable().optional(),
  scheduleDayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  scheduleTimeStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  scheduleTimeEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  ageRangeBucketId: z.string().nullable().optional(),
})

export type MatchingProfileInput = z.infer<typeof matchingProfileSchema>

/** The three keys that describe availability — stored per record type. */
export const SCHEDULE_KEYS = [
  "scheduleDayOfWeek",
  "scheduleTimeStart",
  "scheduleTimeEnd",
] as const satisfies readonly (keyof MatchingProfileInput)[]

/**
 * Profile columns that exist on both Guest and Member, written the same way on
 * each. The list exists so a new profile column can only be added in one place.
 */
export const SHARED_PROFILE_KEYS = [
  "lifeStageId",
  "gender",
  "language",
  "meetingPreference",
  "workCity",
  "workIndustry",
  "birthMonth",
  "birthYear",
  "ageRangeBucketId",
] as const satisfies readonly (keyof MatchingProfileInput)[]
