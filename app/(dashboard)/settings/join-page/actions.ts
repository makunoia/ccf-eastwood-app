"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const joinPageSettingsSchema = z.object({
  joinPageTitle: z.string().min(1, "Title is required"),
  joinPageDescription: z.string(),
  joinPageLogoUrl: z.string(),
  joinPageBackgroundImageUrl: z.string(),
  joinPageAccentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color (e.g. #3b82f6)")
    .or(z.literal("")),
})

export type JoinPageSettingsValues = z.infer<typeof joinPageSettingsSchema>

export async function saveJoinPageSettings(
  raw: JoinPageSettingsValues
): Promise<ActionResult> {
  const parsed = joinPageSettingsSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    await db.siteSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...parsed.data },
      update: parsed.data,
    })
    revalidatePath("/settings/join-page")
    revalidatePath("/join-small-group")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save settings" }
  }
}
