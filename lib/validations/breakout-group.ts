import { z } from "zod"

export const breakoutGroupSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100),
    facilitatorId: z.string().nullable().optional(),
    coFacilitatorId: z.string().nullable().optional(),
    memberLimit: z.coerce.number().int().positive("Must be a positive number").nullable().optional(),
    // Matching profile — the four factors a breakout group matches on. Meeting
    // format, location city and meeting schedule are deliberately gone: a
    // breakout table meets once, during the event, at the venue. Their columns
    // survive on BreakoutGroup but nothing reads or writes them any more.
    lifeStageIds: z.array(z.string()).default([]),
    genderFocus: z.enum(["Male", "Female", "Mixed"]).nullable().optional(),
    language: z.array(z.string()).default([]),
    ageRangeMin: z.coerce.number().int().min(0).nullable().optional(),
    ageRangeMax: z.coerce.number().int().min(0).nullable().optional(),
    /** Not matching — which DGroup receives this group's Catch Mech requests. */
    linkedSmallGroupId: z.string().nullable().optional(),
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
