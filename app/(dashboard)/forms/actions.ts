"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import type { FormKey } from "@/app/generated/prisma/client"
import { FORM_REGISTRY, scopeKeyFor } from "@/lib/forms/registry"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color (e.g. #3b82f6)")
  .or(z.literal(""))

const formConfigSchema = z.object({
  isOpen: z.boolean().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  logoUrl: z.string().optional(),
  bannerUrl: z.string().optional(),
  primaryColor: hexColor.optional(),
})

export type FormConfigValues = z.infer<typeof formConfigSchema>

// Normalize "" → null so a cleared override falls back to scope defaults.
function blankToNull(v: string | undefined): string | null | undefined {
  if (v === undefined) return undefined
  return v.trim() === "" ? null : v.trim()
}

function revalidateForForm(key: FormKey, eventId: string | null) {
  if (eventId) {
    revalidatePath(`/event/${eventId}/forms`)
    revalidatePath(`/event/${eventId}/forms/${key}`)
  } else {
    revalidatePath("/forms")
    revalidatePath(`/forms/${key}`)
  }
  const publicPath = FORM_REGISTRY[key].publicPath?.(eventId ?? undefined)
  if (publicPath) revalidatePath(publicPath)
}

export async function saveFormConfig(
  key: FormKey,
  eventId: string | null,
  raw: FormConfigValues
): Promise<ActionResult> {
  const parsed = formConfigSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const { isOpen, title, description, logoUrl, bannerUrl, primaryColor } = parsed.data
  const data = {
    isOpen,
    title: blankToNull(title),
    description: blankToNull(description),
    logoUrl: blankToNull(logoUrl),
    bannerUrl: blankToNull(bannerUrl),
    primaryColor: blankToNull(primaryColor),
  }

  try {
    await db.formConfig.upsert({
      where: { scopeKey: scopeKeyFor(key, eventId) },
      create: { scopeKey: scopeKeyFor(key, eventId), key, eventId, ...data },
      update: data,
    })
    revalidateForForm(key, eventId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save form settings" }
  }
}

export async function setFormOpen(
  key: FormKey,
  eventId: string | null,
  isOpen: boolean
): Promise<ActionResult> {
  try {
    await db.formConfig.upsert({
      where: { scopeKey: scopeKeyFor(key, eventId) },
      create: { scopeKey: scopeKeyFor(key, eventId), key, eventId, isOpen },
      update: { isOpen },
    })
    revalidateForForm(key, eventId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update form availability" }
  }
}
