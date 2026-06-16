"use server"

import { signIn } from "@/lib/auth"
import { AuthError } from "next-auth"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { signPreAuthToken } from "@/lib/auth-tokens"
import { resolveLandingPathForUser } from "@/lib/landing.server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export async function login(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const username = ((formData.get("username") as string | null) ?? "").trim().toLowerCase()
  const password = (formData.get("password") as string | null) ?? ""

  // Look up user and verify password manually before deciding auth path
  const user = await db.user.findUnique({
    where: { username },
    select: { id: true, password: true, totpEnabled: true },
  })

  if (!user || !user.password) {
    return { error: "Invalid username or password." }
  }

  const isValid = await bcrypt.compare(password, user.password)
  if (!isValid) {
    return { error: "Invalid username or password." }
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
      username,
      password,
      redirectTo: await resolveLandingPathForUser(user.id),
    })
    return {}
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "Invalid username or password." }
        default:
          return { error: "Something went wrong. Please try again." }
      }
    }
    throw error
  }
}
