"use server"

import { signIn } from "@/lib/auth"
import { AuthError } from "next-auth"
import { db } from "@/lib/db"
import { verifyPreAuthToken } from "@/lib/auth-tokens"
import { verifyTotpCode } from "@/lib/totp"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export async function verifyOtp(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const code = ((formData.get("code") as string | null) ?? "").replace(/\s/g, "")

  const jar = await cookies()
  const rawToken = jar.get("pre_auth_token")?.value

  if (!rawToken) {
    return { error: "Session expired. Please sign in again." }
  }

  const userId = verifyPreAuthToken(rawToken)
  if (!userId) {
    jar.delete("pre_auth_token")
    redirect("/login")
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, totpSecret: true },
  })

  if (!user?.totpSecret) {
    return { error: "Two-factor authentication is not configured." }
  }

  if (!verifyTotpCode(user.totpSecret, code)) {
    return { error: "Invalid code. Please try again." }
  }

  // Code is correct — clear the pre-auth cookie and create a real session
  jar.delete("pre_auth_token")

  try {
    await signIn("credentials", {
      preAuthToken: rawToken,
      redirectTo: "/dashboard",
    })
    return {}
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Authentication failed. Please sign in again." }
    }
    throw error
  }
}
