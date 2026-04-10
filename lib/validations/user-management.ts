import { z } from "zod"

export const FEATURE_AREAS = [
  "Members",
  "Guests",
  "SmallGroups",
  "Ministries",
  "Events",
  "Volunteers",
] as const

export type FeatureAreaValue = (typeof FEATURE_AREAS)[number]

export const createUserSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  name: z.string().min(1, "Name is required").trim(),
  permissions: z.array(z.enum(FEATURE_AREAS)),
  eventIds: z.array(z.string()),
})

export type CreateUserInput = z.infer<typeof createUserSchema>

export const updateUserPermissionsSchema = z.object({
  permissions: z.array(z.enum(FEATURE_AREAS)),
  eventIds: z.array(z.string()),
})

export type UpdateUserPermissionsInput = z.infer<typeof updateUserPermissionsSchema>

export const changePasswordSchema = z
  .object({
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
