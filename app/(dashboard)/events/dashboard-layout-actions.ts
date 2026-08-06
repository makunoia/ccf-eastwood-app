"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canAccessEvent, canWrite } from "@/lib/permissions"
import {
  DASHBOARD_WIDGETS,
  DASHBOARD_WIDGET_KEYS,
  WIDGET_WIDTHS,
  isWidgetAvailable,
  isWidthAllowed,
  type WidgetWidth,
} from "@/lib/events/dashboard-widgets"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * Write access to one event's data.
 *
 * Middleware gates `/event/<id>` on the *URL's* event id, but a server action
 * carries its own argument — so a Staff user scoped to a subset of events has to
 * be re-checked against the id passed in here, not just against the Events
 * feature flag.
 */
async function requireEventWrite(eventId: string): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canWrite(session, "Events")) return { error: "Unauthorized." }
  if (!canAccessEvent(session, eventId)) return { error: "Unauthorized." }
  return null
}

const entrySchema = z.object({
  key: z.enum(DASHBOARD_WIDGET_KEYS),
  visible: z.boolean(),
  // Derived from the registry rather than restated, so adding a span size in one
  // place doesn't silently fail validation here.
  width: z
    .number()
    .int()
    .refine(
      (w): w is WidgetWidth => (WIDGET_WIDTHS as readonly number[]).includes(w),
      "Unsupported widget width."
    ),
})

/**
 * The whole layout in display order — position is the array index, not a field.
 * A save always sends every widget, so ordering is never ambiguous and a partial
 * write can't leave two widgets fighting over the same slot.
 */
const layoutSchema = z
  .array(entrySchema)
  .max(DASHBOARD_WIDGET_KEYS.length)
  .refine(
    (entries) => new Set(entries.map((e) => e.key)).size === entries.length,
    "A widget was listed more than once."
  )

export type DashboardLayoutInput = z.infer<typeof layoutSchema>

/**
 * Persist an event's dashboard layout.
 *
 * Written as delete-then-recreate inside a transaction rather than upserts: the
 * client owns the full ordering, so replacing the set wholesale keeps `order`
 * dense and sequential and can't strand a row for a widget that was dropped from
 * the payload.
 */
export async function saveEventDashboardLayout(
  eventId: string,
  raw: DashboardLayoutInput
): Promise<ActionResult> {
  const authError = await requireEventWrite(eventId)
  if (authError) return { success: false, error: authError.error }

  const parsed = layoutSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid layout" }
  }

  try {
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { id: true, type: true, modules: { select: { type: true } } },
    })
    if (!event) return { success: false, error: "Event not found." }

    const modules = event.modules.map((m) => m.type)

    // Re-check availability and width server-side. The customizer already hides
    // what doesn't apply, so anything failing here is a stale tab or a crafted
    // payload — either way it must not be able to store a widget this event
    // can't render, or a width the widget doesn't offer.
    for (const entry of parsed.data) {
      const meta = DASHBOARD_WIDGETS[entry.key]
      if (!isWidgetAvailable(meta, event.type, modules)) {
        return { success: false, error: `${meta.label} isn't available for this event.` }
      }
      if (meta.lane === "card" && !isWidthAllowed(meta, entry.width)) {
        return { success: false, error: `${meta.label} can't be that width.` }
      }
    }

    await db.$transaction([
      db.eventDashboardWidget.deleteMany({ where: { eventId } }),
      db.eventDashboardWidget.createMany({
        data: parsed.data.map((entry, index) => ({
          eventId,
          key: entry.key,
          visible: entry.visible,
          order: index,
          width: entry.width,
        })),
      }),
    ])

    revalidatePath(`/event/${eventId}/dashboard`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save dashboard layout" }
  }
}

/**
 * Drop every stored row, returning the event to the code-defined defaults.
 * Absence is the default state, so there is nothing to write back.
 */
export async function resetEventDashboardLayout(eventId: string): Promise<ActionResult> {
  const authError = await requireEventWrite(eventId)
  if (authError) return { success: false, error: authError.error }

  try {
    await db.eventDashboardWidget.deleteMany({ where: { eventId } })
    revalidatePath(`/event/${eventId}/dashboard`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to reset dashboard layout" }
  }
}
