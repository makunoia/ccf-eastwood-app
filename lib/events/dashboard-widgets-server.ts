import "server-only"

import { db } from "@/lib/db"
import type { EventModuleType, EventType } from "@/app/generated/prisma/client"
import {
  resolveDashboardLayout,
  type DashboardLayout,
  type StoredWidget,
} from "@/lib/events/dashboard-widgets"

/**
 * DB-aware entry point for the dashboard layout. Prisma is isolated here so
 * `dashboard-widgets.ts` stays importable from client components — the same
 * split as `lib/forms/context-config.ts` / `context-config-server.ts`.
 */

export async function getStoredDashboardWidgets(eventId: string): Promise<StoredWidget[]> {
  return db.eventDashboardWidget.findMany({
    where: { eventId },
    orderBy: { order: "asc" },
    select: { key: true, visible: true, order: true, width: true },
  })
}

/**
 * The event's resolved layout — stored rows merged over the code defaults, with
 * widgets unavailable for this event type or its modules dropped.
 *
 * Both lanes come back with hidden widgets included; render paths should call
 * `visibleLayout`, and the customizer needs the hidden ones to list them.
 */
export async function getEventDashboardLayout(
  eventId: string,
  eventType: EventType,
  modules: readonly EventModuleType[]
): Promise<DashboardLayout> {
  const stored = await getStoredDashboardWidgets(eventId)
  return resolveDashboardLayout(stored, eventType, modules)
}
