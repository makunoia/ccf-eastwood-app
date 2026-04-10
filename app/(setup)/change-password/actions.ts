"use server"

import { auth, signOut } from "@/lib/auth"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { changePasswordSchema } from "@/lib/validations/user-management"

export async function changePassword(
  _prevState: { error?: string; fieldErrors?: Record<string, string> } | null,
  formData: FormData
): Promise<{ error?: string; fieldErrors?: Record<string, string> }> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not authenticated." }

  const raw = {
    newPassword: formData.get("newPassword") as string,
    confirmPassword: formData.get("confirmPassword") as string,
  }

  const parsed = changePasswordSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const [key, issues] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[key] = issues?.[0] ?? "Invalid value"
    }
    return { fieldErrors }
  }

  const hashed = await bcrypt.hash(parsed.data.newPassword, 12)

  await db.user.update({
    where: { id: session.user.id },
    data: { password: hashed, mustChangePassword: false },
  })

  // Force a fresh login so the new JWT reflects mustChangePassword: false
  // signOut throws a redirect internally; the return is unreachable but required by TypeScript
  await signOut({ redirectTo: "/login" })
  return {}
}
