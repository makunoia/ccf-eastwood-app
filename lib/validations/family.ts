import { z } from "zod"

export const FAMILY_ROLES = ["Father", "Mother", "Child", "Guardian", "Other"] as const
export type FamilyRoleValue = (typeof FAMILY_ROLES)[number]

export const FAMILY_ROLE_LABELS: Record<FamilyRoleValue, string> = {
  Father: "Father",
  Mother: "Mother",
  Child: "Child",
  Guardian: "Guardian",
  Other: "Other",
}

const nullableString = z
  .string()
  .nullish()
  .transform((v) => (v === "" || v == null ? null : v.trim()))

export const familySchema = z.object({
  name: z.string().min(1, "Family name is required").trim(),
  notes: nullableString,
})

export type FamilyInput = z.infer<typeof familySchema>

export const familyMemberSchema = z
  .object({
    memberId: nullableString,
    guestId: nullableString,
    role: z.enum(FAMILY_ROLES),
  })
  .refine((v) => (v.memberId == null) !== (v.guestId == null), {
    message: "Exactly one of member or guest must be selected",
  })

export type FamilyMemberInput = z.infer<typeof familyMemberSchema>
