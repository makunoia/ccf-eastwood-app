"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const hexColor = z
  .string()
  .optional()
  .transform((v) => (v === "" || v == null ? null : v.trim()))
  .refine((v) => v == null || /^#[0-9A-Fa-f]{6}$/.test(v), {
    message: "Must be a valid hex color",
  })

const eventBrandingSchema = z.object({
  useMinistryBrand: z.boolean(),
  brandMinistryId: z.string().nullable().optional(),
  logoUrl: z
    .string()
    .optional()
    .transform((v) => (v === "" || v == null ? null : v)),
  themeColorPrimary: hexColor,
  themeColorSecondary: hexColor,
  themeColorAccent: hexColor,
})

export type EventBrandingValues = {
  useMinistryBrand: boolean
  brandMinistryId: string
  logoUrl: string
  themeColorPrimary: string
  themeColorSecondary: string
  themeColorAccent: string
}

export async function updateEventBranding(
  eventId: string,
  raw: EventBrandingValues
): Promise<ActionResult> {
  const parsed = eventBrandingSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  try {
    await db.event.update({
      where: { id: eventId },
      data: {
        useMinistryBrand: parsed.data.useMinistryBrand,
        brandMinistryId: parsed.data.brandMinistryId ?? null,
        logoUrl: parsed.data.logoUrl ?? null,
        themeColorPrimary: parsed.data.themeColorPrimary ?? null,
        themeColorSecondary: parsed.data.themeColorSecondary ?? null,
        themeColorAccent: parsed.data.themeColorAccent ?? null,
      },
    })
    revalidatePath(`/event/${eventId}`, "layout")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update branding" }
  }
}
