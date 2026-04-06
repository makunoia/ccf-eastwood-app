import { z } from "zod"

export const breakoutGroupSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100),
    facilitatorId: z.string().nullable().optional(),
    coFacilitatorId: z.string().nullable().optional(),
    memberLimit: z.coerce.number().int().positive("Must be a positive number").nullable().optional(),
    // Matching profile (optional — used for future auto-assign)
    lifeStageId: z.string().nullable().optional(),
    genderFocus: z.enum(["Male", "Female", "Mixed"]).nullable().optional(),
    language: z.array(z.string()).default([]),
    ageRangeMin: z.coerce.number().int().min(0).nullable().optional(),
    ageRangeMax: z.coerce.number().int().min(0).nullable().optional(),
    meetingFormat: z.enum(["Online", "Hybrid", "InPerson"]).nullable().optional(),
    locationCity: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      if (
        data.facilitatorId &&
        data.coFacilitatorId &&
        data.facilitatorId === data.coFacilitatorId
      ) {
        return false
      }
      return true
    },
    {
      message: "Facilitator and co-facilitator must be different volunteers",
      path: ["coFacilitatorId"],
    }
  )
  .refine(
    (data) => {
      if (
        data.ageRangeMin != null &&
        data.ageRangeMax != null &&
        data.ageRangeMin > data.ageRangeMax
      ) {
        return false
      }
      return true
    },
    {
      message: "Min age must not exceed max age",
      path: ["ageRangeMax"],
    }
  )

export type BreakoutGroupFormValues = z.infer<typeof breakoutGroupSchema>
