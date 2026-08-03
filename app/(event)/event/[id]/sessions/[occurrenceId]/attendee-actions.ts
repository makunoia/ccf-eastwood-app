"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite, canAccessEvent } from "@/lib/permissions"

type ActionResult = { success: true } | { success: false; error: string }

/**
 * Write access to one event's data.
 *
 * Middleware gates `/event/<id>` on the *URL's* event id, but a server action
 * carries its own argument — so the event is resolved from the attendance row
 * and re-checked here.
 */
async function requireEventWrite(eventId: string): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canWrite(session, "Events")) return { error: "Unauthorized." }
  if (!canAccessEvent(session, eventId)) return { error: "Unauthorized." }
  return null
}

async function loadAttendee(attendeeId: string) {
  return db.occurrenceAttendee.findUnique({
    where: { id: attendeeId },
    select: {
      id: true,
      occurrenceId: true,
      registrantId: true,
      occurrence: { select: { eventId: true } },
    },
  })
}

/**
 * Pins (or clears) the New/Returning badge for one attendance row.
 *
 * `isReturner: null` restores the derived value. Only registrant rows are
 * eligible — volunteers are established by definition and never tagged "New".
 */
export async function setAttendeeReturnerStatus(
  attendeeId: string,
  isReturner: boolean | null,
): Promise<ActionResult> {
  try {
    // A server action is a public HTTP surface — the argument types are not enforced
    // at runtime, so anything but a tri-state is rejected rather than handed to Prisma.
    if (isReturner !== null && typeof isReturner !== "boolean") {
      return { success: false, error: "Invalid status." }
    }

    const attendee = await loadAttendee(attendeeId)
    if (!attendee) return { success: false, error: "Attendance record not found." }

    const denied = await requireEventWrite(attendee.occurrence.eventId)
    if (denied) return { success: false, error: denied.error }

    if (!attendee.registrantId) {
      return { success: false, error: "Volunteer attendance has no New/Returning status." }
    }

    await db.occurrenceAttendee.update({
      where: { id: attendeeId },
      data: { isReturnerOverride: isReturner },
    })

    revalidatePath(
      `/event/${attendee.occurrence.eventId}/sessions/${attendee.occurrenceId}`,
    )
    return { success: true }
  } catch {
    return { success: false, error: "Failed to update status." }
  }
}

/** Removes one person from a session's checked-in list. Hard delete. */
export async function removeSessionAttendee(attendeeId: string): Promise<ActionResult> {
  try {
    const attendee = await loadAttendee(attendeeId)
    if (!attendee) return { success: false, error: "Attendance record not found." }

    const denied = await requireEventWrite(attendee.occurrence.eventId)
    if (denied) return { success: false, error: denied.error }

    // deleteMany, not delete: if a second admin removed the same row between the load
    // above and here, the desired end state already holds — reporting a failure would
    // just leave a stale row on their screen.
    await db.occurrenceAttendee.deleteMany({ where: { id: attendeeId } })

    // Same set `deleteOccurrence` refreshes — an attendance row feeds the session list's
    // count, the dashboard's turnout figures, and the public check-in screen.
    const { eventId } = attendee.occurrence
    revalidatePath(`/event/${eventId}/sessions/${attendee.occurrenceId}`)
    revalidatePath(`/event/${eventId}/sessions`)
    revalidatePath(`/event/${eventId}/dashboard`)
    revalidatePath(`/events/${eventId}/checkin`)
    revalidatePath(`/events/${eventId}/checkin/${attendee.occurrenceId}`)
    return { success: true }
  } catch {
    return { success: false, error: "Failed to remove attendee." }
  }
}
