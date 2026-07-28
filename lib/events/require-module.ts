import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import type { EventModuleType } from "@/app/generated/prisma/client"

/**
 * Route guard for module-gated event pages.
 *
 * Hiding a nav item isn't enough — a bookmark, a stale tab, or a shared link would
 * still reach the page. Every route belonging to an optional module calls this so
 * the module state is enforced where the data is read, not just where it's linked.
 *
 * Renders the 404 rather than redirecting: to someone without the module enabled,
 * the page genuinely doesn't exist.
 */
export async function requireEventModule(
  eventId: string,
  type: EventModuleType
): Promise<void> {
  const enabled = await db.eventModule.findUnique({
    where: { eventId_type: { eventId, type } },
    select: { id: true },
  })
  if (!enabled) notFound()
}
