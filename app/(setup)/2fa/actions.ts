"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { generateSecret, verifyTotpCode } from "@/lib/totp"
import { redirect } from "next/navigation"

/**
 * Generate a new TOTP secret for the current user and persist it.
 * Called when the 2FA setup page loads for the first time.
 * Returns the base32 secret (used to build the QR URI client-side).
 */
export async function initTotpSetup(): Promise<
  { secret: string; email: string; error?: never } | { secret?: never; email?: never; error: string }
> {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not authenticated." }

  const secret = generateSecret()

  await db.user.update({
    where: { id: session.user.id },
    data: { totpSecret: secret },
  })

  return { secret, email: session.user.email ?? "user" }
}

/**
 * Verify the 6-digit code and activate TOTP for the current user.
 */
export async function enableTotp(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const code = ((formData.get("code") as string | null) ?? "").replace(/\s/g, "")

  const session = await auth()
  if (!session?.user?.id) return { error: "Not authenticated." }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { totpSecret: true },
  })

  if (!user?.totpSecret) {
    return { error: "Setup not initialised. Please refresh the page." }
  }

  if (!verifyTotpCode(user.totpSecret, code)) {
    return { error: "Invalid code. Make sure your device time is correct and try again." }
  }

  await db.user.update({
    where: { id: session.user.id },
    data: { totpEnabled: true, requiresTotpSetup: false },
  })

  redirect("/setup/change-password")
}
