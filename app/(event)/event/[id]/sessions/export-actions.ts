"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canAccessEvent, canExport } from "@/lib/permissions"
import {
  buildSessionAttendanceColumns,
  type SessionAttendanceColumnState,
  type SessionAttendanceExportRow,
} from "@/lib/exports/session-attendance"

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export type SessionAttendanceExportPayload = {
  rows: SessionAttendanceExportRow[]
  columns: SessionAttendanceColumnState[]
}

/**
 * Flattens check-ins into export rows — one row per attendee per session,
 * participants and volunteers alike. Covers every session of the event, or a
 * single session when `occurrenceId` is given.
 *
 * Returns the column offer alongside the rows: which columns are worth showing
 * depends on what the rows actually hold (a series title, a nickname), and only
 * the server has seen them all.
 */
export async function getSessionsAttendanceExport(
  eventId: string,
  occurrenceId?: string,
): Promise<ActionResult<SessionAttendanceExportPayload>> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Not authenticated." }
  if (!canExport(session, "Events")) return { success: false, error: "Unauthorized." }
  // Per-event scoping, same as the registrants and volunteers exports: the
  // Events feature grant says a staffer may export, `UserEventAccess` says which
  // events they may export. Without this a staffer scoped to one event could
  // pull any other event's attendance sheet.
  if (!canAccessEvent(session, eventId)) return { success: false, error: "Unauthorized." }

  try {
    const personSelect = { firstName: true, lastName: true, nickname: true, phone: true, email: true } as const
    const registrantSelect = { id: true, memberId: true, firstName: true, lastName: true, nickname: true, email: true, mobileNumber: true,
      member: { select: personSelect }, guest: { select: personSelect } } as const
    const occurrences = await db.eventOccurrence.findMany({
      where: { eventId, ...(occurrenceId ? { id: occurrenceId } : {}) }, orderBy: { date: "asc" },
      select: { id: true, date: true, series: { select: { title: true } },
        sessionRegistrations: { select: { registrant: { select: registrantSelect } } },
        attendees: { orderBy: { checkedInAt: "asc" }, select: { checkedInAt: true,
          registrant: { select: registrantSelect }, volunteer: { select: { member: { select: personSelect } } } } },
      },
    })
    const rows: SessionAttendanceExportRow[] = occurrences.flatMap((occurrence) => {
      const base = { sessionDate: occurrence.date.toISOString().split("T")[0], seriesTitle: occurrence.series?.title ?? null }
      const expectedRegistrantIds = new Set(occurrence.sessionRegistrations.map((sessionRegistration) => sessionRegistration.registrant.id))
      const presentIds = new Set(occurrence.attendees.flatMap((a) => a.registrant ? [a.registrant.id] : []))
      const participantRow = (registrant: (typeof occurrence.sessionRegistrations)[number]["registrant"], checkedInAt: Date | null): SessionAttendanceExportRow => {
        const person = registrant.member ?? registrant.guest
        return { ...base, firstName: person?.firstName ?? registrant.firstName ?? "", lastName: person?.lastName ?? registrant.lastName ?? "",
          nickname: registrant.nickname ?? person?.nickname ?? null, mobile: person?.phone ?? registrant.mobileNumber ?? "",
          email: person?.email ?? registrant.email ?? null, type: registrant.memberId ? "Member" : "Guest", sessionRegistration: expectedRegistrantIds.has(registrant.id), checkedInAt: checkedInAt?.toISOString() ?? null }
      }
      return [
        ...occurrence.attendees.map((attendee): SessionAttendanceExportRow => {
          if (attendee.registrant) return participantRow(attendee.registrant, attendee.checkedInAt)
          const member = attendee.volunteer!.member
          return { ...base, firstName: member.firstName, lastName: member.lastName, nickname: member.nickname, mobile: member.phone ?? "", email: member.email, type: "Volunteer", sessionRegistration: false, checkedInAt: attendee.checkedInAt.toISOString() }
        }),
        ...occurrence.sessionRegistrations.filter((sessionRegistration) => !presentIds.has(sessionRegistration.registrant.id)).map((sessionRegistration) => participantRow(sessionRegistration.registrant, null)),
      ]
    })

    return { success: true, data: { rows, columns: buildSessionAttendanceColumns(rows) } }
  } catch {
    return { success: false, error: "Failed to export attendance." }
  }
}
