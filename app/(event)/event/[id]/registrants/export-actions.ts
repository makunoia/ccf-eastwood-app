"use server"

import { auth } from "@/lib/auth"
import { canExport } from "@/lib/permissions"
import {
  getEventRegistrationExport,
  type EventRegistrationExportPayload,
} from "@/lib/exports/event-registrations-server"

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export async function getEventRegistrationsExport(
  eventId: string,
): Promise<ActionResult<EventRegistrationExportPayload>> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Not authenticated." }
  if (!canExport(session, "Events")) return { success: false, error: "Unauthorized." }

  try {
    const data = await getEventRegistrationExport(session, eventId)
    if (!data) return { success: false, error: "Unauthorized." }
    return { success: true, data }
  } catch {
    return { success: false, error: "Failed to export registrations." }
  }
}
