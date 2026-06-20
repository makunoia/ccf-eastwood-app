import { db } from "@/lib/db"
import type { FormKey } from "@/app/generated/prisma/client"
import { scopeKeyFor } from "./registry"

/** The subset of FormConfig that drives public rendering + access. */
export type FormConfigData = {
  key: FormKey
  eventId: string | null
  isOpen: boolean
  title: string | null
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  primaryColor: string | null
}

export type FormTheme = {
  title: string | null
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  primaryColor: string | null
}

function synthesizedDefault(key: FormKey, eventId?: string | null): FormConfigData {
  return {
    key,
    eventId: eventId ?? null,
    isOpen: true,
    title: null,
    description: null,
    logoUrl: null,
    bannerUrl: null,
    primaryColor: null,
  }
}

/**
 * Read a form's config. Returns a synthesized "open, no overrides" default when
 * no row exists, so missing rows behave as Open — no pre-seeding required.
 */
export async function getFormConfig(
  key: FormKey,
  eventId?: string | null
): Promise<FormConfigData> {
  const row = await db.formConfig.findUnique({
    where: { scopeKey: scopeKeyFor(key, eventId) },
    select: {
      key: true,
      eventId: true,
      isOpen: true,
      title: true,
      description: true,
      logoUrl: true,
      bannerUrl: true,
      primaryColor: true,
    },
  })
  return row ?? synthesizedDefault(key, eventId)
}

/**
 * Merge a form's overrides over a computed fallback theme (event/ministry brand
 * for event forms, site/default values for global forms). Override wins when set.
 */
export function resolveFormTheme(
  cfg: FormConfigData,
  fallback: Partial<FormTheme>
): FormTheme {
  return {
    title: cfg.title ?? fallback.title ?? null,
    description: cfg.description ?? fallback.description ?? null,
    logoUrl: cfg.logoUrl ?? fallback.logoUrl ?? null,
    bannerUrl: cfg.bannerUrl ?? fallback.bannerUrl ?? null,
    primaryColor: cfg.primaryColor ?? fallback.primaryColor ?? null,
  }
}
