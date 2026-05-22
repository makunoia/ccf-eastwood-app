"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import {
  updateProfileSchema,
  accountChangePasswordSchema,
} from "@/lib/validations/user-management"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

export async function updateProfile(name: string): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Not authenticated." }

  const parsed = updateProfileSchema.safeParse({ name })
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const exists = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  })
  if (!exists) return { success: false, error: "User account not found." }

  try {
    await db.user.update({
      where: { id: session.user.id },
      data: { name: parsed.data.name },
    })
    return { success: true, data: undefined }
  } catch (e) {
    console.error("[updateProfile] DB error:", e)
    return { success: false, error: "Failed to update profile" }
  }
}

export async function changeAccountPassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Not authenticated." }

  const parsed = accountChangePasswordSchema.safeParse({
    currentPassword,
    newPassword,
    confirmPassword,
  })
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const [key, issues] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[key] = issues?.[0] ?? "Invalid value"
    }
    return { success: false, error: "Validation failed", fieldErrors }
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { password: true },
  })
  if (!user?.password) return { success: false, error: "Account has no password set." }

  const isValid = await bcrypt.compare(parsed.data.currentPassword, user.password)
  if (!isValid) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: { currentPassword: "Current password is incorrect" },
    }
  }

  const hashed = await bcrypt.hash(parsed.data.newPassword, 12)

  try {
    await db.user.update({
      where: { id: session.user.id },
      data: { password: hashed },
    })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update password" }
  }
}
