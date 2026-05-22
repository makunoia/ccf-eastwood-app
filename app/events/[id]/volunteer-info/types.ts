import { z } from "zod"

export const groupFieldsSchema = z.object({
  name: z.string().min(1),
  lifeStageId: z.string().nullable(),
  genderFocus: z.enum(["Male", "Female", "Mixed"]).nullable(),
  language: z.array(z.string()),
  ageRangeMin: z.number().int().min(0).nullable(),
  ageRangeMax: z.number().int().min(0).nullable(),
  meetingFormat: z.enum(["Online", "Hybrid", "InPerson"]).nullable(),
  locationCity: z.string().nullable(),
  memberLimit: z.number().int().min(1).nullable(),
  scheduleDayOfWeek: z.number().int().min(0).max(6).nullable(),
  scheduleTimeStart: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  scheduleTimeEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
})

export type GroupFields = z.infer<typeof groupFieldsSchema>

export const volunteerInfoSchema = z.object({
  memberId: z.string(),
  eventId: z.string(),

  // Personal
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email").nullable(),
  phone: z.string().min(1, "Mobile number is required"),

  // Leadership
  leadershipStatus: z.enum(["leader", "timothy", "none"]),

  // Set when leadershipStatus === "leader" or "timothy"
  groupFields: groupFieldsSchema.nullable(),
})

export type VolunteerInfoInput = z.infer<typeof volunteerInfoSchema>

export type VolunteerIdentity = {
  memberId: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  groupStatus: "Member" | "Timothy" | "Leader" | null
  schedulePreferences: { dayOfWeek: number; timeStart: string; timeEnd: string | null }[]
  ledGroup: {
    id: string
    name: string
    lifeStageId: string | null
    genderFocus: "Male" | "Female" | "Mixed" | null
    language: string[]
    ageRangeMin: number | null
    ageRangeMax: number | null
    meetingFormat: "Online" | "Hybrid" | "InPerson" | null
    locationCity: string | null
    memberLimit: number | null
    scheduleDayOfWeek: number | null
    scheduleTimeStart: string | null
    scheduleTimeEnd: string | null
  } | null
}
