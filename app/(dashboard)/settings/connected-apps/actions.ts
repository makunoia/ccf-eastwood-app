"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function revokeConnectedApp(tokenId: string) {
  const session = await auth()
  if (session?.user?.role !== "SuperAdmin") return { success: false as const, error: "Unauthorized." }
  await db.mcpToken.updateMany({ where: { id: tokenId, revokedAt: null }, data: { revokedAt: new Date() } })
  revalidatePath("/settings/connected-apps")
  return { success: true as const }
}
