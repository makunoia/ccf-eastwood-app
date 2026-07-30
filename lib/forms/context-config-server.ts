import { db } from "@/lib/db"
import type { EventModuleType, FormContext } from "@/app/generated/prisma/client"
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
 * Read one context's stored config. Returns the bare config when no row exists,
 * so missing rows behave as "collect nothing optional" without pre-seeding.
 *
 * This is the storage-level read — what the admin has saved. Anything rendering or
 * validating an actual form wants `getEffectiveFormConfig` instead, which also
 * applies the module gates.
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

/** Read all three contexts' stored config at once. */
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

/**
 * Overlay the module-driven sections onto a stored config.
 *
 * Two sections aren't the form builder's to decide. The payment step exists
 * exactly when the Priced module is on — that module is the single gate, so the
 * stored flag is ignored entirely and can never drift from it. The breakout step
 * is the admin's choice, but only once Breakout Groups exist to choose from.
 *
 * Kept separate from the stored read so "what did the admin save" and "what does
 * this form actually do" stay answerable independently — the migration backfill
 * and the builder care about the former, every form surface about the latter.
 */
export function applyModuleGates(
  config: EventFormConfigData,
  modules: EventModuleType[]
): EventFormConfigData {
  return {
    ...config,
    sectionPayment: modules.includes("Priced"),
    sectionBreakout: config.sectionBreakout && modules.includes("Breakout"),
  }
}

async function eventModules(eventId: string): Promise<EventModuleType[]> {
  const rows = await db.eventModule.findMany({
    where: { eventId },
    select: { type: true },
  })
  return rows.map((r) => r.type)
}

/**
 * What a form actually collects: the stored config with the module gates applied.
 * Every rendering, submitting, importing, and reporting surface reads this.
 */
export async function getEffectiveFormConfig(
  eventId: string,
  context: FormContext
): Promise<EventFormConfigData> {
  const [config, modules] = await Promise.all([
    getEventFormConfig(eventId, context),
    eventModules(eventId),
  ])
  return applyModuleGates(config, modules)
}

/** All three contexts' effective config — for the builder UI. */
export async function getEffectiveFormConfigs(
  eventId: string
): Promise<Record<FormContext, EventFormConfigData>> {
  const [configs, modules] = await Promise.all([
    getEventFormConfigs(eventId),
    eventModules(eventId),
  ])
  return Object.fromEntries(
    FORM_CONTEXTS.map((ctx) => [ctx, applyModuleGates(configs[ctx], modules)])
  ) as Record<FormContext, EventFormConfigData>
}

// ─── Success screen copy (CCF-130) ───────────────────────────────────────────
// Kept as its own read rather than folded into `EventFormConfigData`: that type
// is a `Record<FormToggleKey, boolean>` which the builder, the migration backfill
// and the copy-between-contexts action all iterate as booleans. A string field
// riding along inside it would have to be special-cased in every one of them.

/** The configured success sub copy for a context, or null when unset. */
export async function getEventFormSuccessMessage(
  eventId: string,
  context: FormContext
): Promise<string | null> {
  const row = await db.eventFormConfig.findUnique({
    where: { eventId_context: { eventId, context } },
    select: { successMessage: true },
  })
  return row?.successMessage ?? null
}

/** All three contexts' stored success copy at once — for the builder UI. */
export async function getEventFormSuccessMessages(
  eventId: string
): Promise<Record<FormContext, string | null>> {
  const rows = await db.eventFormConfig.findMany({
    where: { eventId },
    select: { context: true, successMessage: true },
  })
  const byContext = new Map(rows.map((r) => [r.context, r.successMessage]))
  return Object.fromEntries(
    FORM_CONTEXTS.map((ctx) => [ctx, byContext.get(ctx) ?? null])
  ) as Record<FormContext, string | null>
}

/** Cluster shared form: the configured success sub copy for a context. */
export async function getClusterFormSuccessMessage(
  clusterId: string,
  context: FormContext
): Promise<string | null> {
  const row = await db.eventFormConfig.findUnique({
    where: { clusterId_context: { clusterId, context } },
    select: { successMessage: true },
  })
  return row?.successMessage ?? null
}

/** Cluster shared form: all contexts' stored success copy — for the builder UI. */
export async function getClusterFormSuccessMessages(
  clusterId: string
): Promise<Record<FormContext, string | null>> {
  const rows = await db.eventFormConfig.findMany({
    where: { clusterId },
    select: { context: true, successMessage: true },
  })
  const byContext = new Map(rows.map((r) => [r.context, r.successMessage]))
  return Object.fromEntries(
    FORM_CONTEXTS.map((ctx) => [ctx, byContext.get(ctx) ?? null])
  ) as Record<FormContext, string | null>
}

/** Cluster shared form (CCF-132): read one context's config, bare when no row exists. */
export async function getClusterFormConfig(
  clusterId: string,
  context: FormContext
): Promise<EventFormConfigData> {
  const row = await db.eventFormConfig.findUnique({
    where: { clusterId_context: { clusterId, context } },
    select: TOGGLE_SELECT,
  })
  return pickToggles(row)
}

/** Cluster shared form: read all contexts at once — for the builder UI. */
export async function getClusterFormConfigs(
  clusterId: string
): Promise<Record<FormContext, EventFormConfigData>> {
  const rows = await db.eventFormConfig.findMany({
    where: { clusterId },
    select: { context: true, ...TOGGLE_SELECT },
  })
  const byContext = new Map(rows.map((r) => [r.context, r]))
  return Object.fromEntries(
    FORM_CONTEXTS.map((ctx) => [ctx, pickToggles(byContext.get(ctx) ?? null)])
  ) as Record<FormContext, EventFormConfigData>
}

