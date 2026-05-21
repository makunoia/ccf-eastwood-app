"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const registrationPageSchema = z.object({
  registrationPageTitle: z.string(),
  registrationPageDescription: z.string(),
  registrationPageBannerUrl: z.string(),
})

export type RegistrationPageValues = z.infer<typeof registrationPageSchema>

export async function updateRegistrationPage(
  eventId: string,
  raw: RegistrationPageValues
): Promise<ActionResult> {
  const parsed = registrationPageSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    await db.event.update({
      where: { id: eventId },
      data: {
        registrationPageTitle: parsed.data.registrationPageTitle || null,
        registrationPageDescription: parsed.data.registrationPageDescription || null,
        registrationPageBannerUrl: parsed.data.registrationPageBannerUrl || null,
      },
    })
    revalidatePath(`/event/${eventId}`, "layout")
    revalidatePath(`/events/${eventId}/register`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save registration page settings" }
  }
}
