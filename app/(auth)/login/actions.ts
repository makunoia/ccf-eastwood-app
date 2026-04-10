"use server"

import { signIn } from "@/lib/auth"
import { AuthError } from "next-auth"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { signPreAuthToken } from "@/lib/auth-tokens"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export async function login(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const email = (formData.get("email") as string | null)?.trim() ?? ""
  const password = (formData.get("password") as string | null) ?? ""

  // Look up user and verify password manually before deciding auth path
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, password: true, totpEnabled: true },
  })

  if (!user || !user.password) {
    return { error: "Invalid email or password." }
  }

  const isValid = await bcrypt.compare(password, user.password)
  if (!isValid) {
    return { error: "Invalid email or password." }
  }

  // If TOTP is enabled → create a pre-auth token and redirect to OTP page
  if (user.totpEnabled) {
    const token = signPreAuthToken(user.id)
    const jar = await cookies()
    jar.set("pre_auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 5 * 60, // 5 minutes
      path: "/",
    })
    redirect("/login/verify-otp")
  }

  // No TOTP → complete sign-in normally; middleware handles setup redirects
  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    })
    return {}
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "Invalid email or password." }
        default:
          return { error: "Something went wrong. Please try again." }
      }
    }
    throw error
  }
}
