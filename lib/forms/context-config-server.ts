import { db } from "@/lib/db"
import type { FormContext } from "@/app/generated/prisma/client"
import {
  BARE_EVENT_FORM_CONFIG,
  FORM_CONTEXTS,
  FORM_TOGGLE_KEYS,
  type EventFormConfigData,
  type FormToggleKey,
} from "./context-config"

/**
 * Server-only reads for the per-(event, context) form config. Kept out of
 * `context-config.ts` so client components can import the constants and metadata
 * without pulling Prisma into the browser bundle.
 */

const TOGGLE_SELECT = Object.fromEntries(FORM_TOGGLE_KEYS.map((k) => [k, true])) as Record<
  FormToggleKey,
  true
>

function pickToggles(row: Partial<EventFormConfigData> | null): EventFormConfigData {
  if (!row) return { ...BARE_EVENT_FORM_CONFIG }
  return Object.fromEntries(
    FORM_TOGGLE_KEYS.map((k) => [k, row[k] ?? false])
  ) as EventFormConfigData
}

/**
 * Read one context's config. Returns the bare config when no row exists, so
 * missing rows behave as "collect nothing optional" without pre-seeding.
 */
export async function getEventFormConfig(
  eventId: string,
  context: FormContext
): Promise<EventFormConfigData> {
  const row = await db.eventFormConfig.findUnique({
    where: { eventId_context: { eventId, context } },
    select: TOGGLE_SELECT,
  })
  return pickToggles(row)
}

/** Read all three contexts at once — for the builder UI. */
export async function getEventFormConfigs(
  eventId: string
): Promise<Record<FormContext, EventFormConfigData>> {
  const rows = await db.eventFormConfig.findMany({
    where: { eventId },
    select: { context: true, ...TOGGLE_SELECT },
  })
  const byContext = new Map(rows.map((r) => [r.context, r]))
  return Object.fromEntries(
    FORM_CONTEXTS.map((ctx) => [ctx, pickToggles(byContext.get(ctx) ?? null)])
  ) as Record<FormContext, EventFormConfigData>
}

