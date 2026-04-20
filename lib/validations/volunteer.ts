import { z } from "zod"

const nullableString = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : v.trim()))

// ─── Create schema ────────────────────────────────────────────────────────────

export const createVolunteerSchema = z.object({
  memberId: z.string().min(1, "Member is required"),
  eventId: z.string().min(1, "Event is required"),
  committeeId: z.string().min(1, "Committee is required"),
  preferredRoleId: z.string().min(1, "Preferred role is required"),
  notes: nullableString,
})

// ─── Update schema ────────────────────────────────────────────────────────────

export const updateVolunteerSchema = z.object({
  memberId: z.string().min(1, "Member is required"),
  eventId: z.string().min(1, "Event is required"),
  committeeId: z.string().min(1, "Committee is required"),
  preferredRoleId: z.string().min(1, "Preferred role is required"),
  assignedRoleId: nullableString,
  status: z.enum(["Pending", "Confirmed", "Rejected"]),
  notes: nullableString,
})

// ─── Committee schemas ────────────────────────────────────────────────────────

export const committeeSchema = z.object({
  name: z.string().min(1, "Committee name is required").trim(),
})

export const roleSchema = z.object({
  name: z.string().min(1, "Role name is required").trim(),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateVolunteerInput = z.infer<typeof createVolunteerSchema>
export type UpdateVolunteerInput = z.infer<typeof updateVolunteerSchema>

export type VolunteerFormValues = {
  memberId: string
  eventId: string
  committeeId: string
  preferredRoleId: string
  assignedRoleId: string
  status: "Pending" | "Confirmed" | "Rejected" | ""
  notes: string
}

export const defaultVolunteerForm: VolunteerFormValues = {
  memberId: "",
  eventId: "",
  committeeId: "",
  preferredRoleId: "",
  assignedRoleId: "",
  status: "",
  notes: "",
}
