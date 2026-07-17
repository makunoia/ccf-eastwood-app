"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canExport } from "@/lib/permissions"
import type { SessionAttendanceExportRow } from "@/lib/export-entities"

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * Flattens check-ins into export rows — one row per attendee per session,
 * participants and volunteers alike. Covers every session of the event, or a
 * single session when `occurrenceId` is given.
 */
export async function getSessionsAttendanceExport(
  eventId: string,
  occurrenceId?: string,
): Promise<ActionResult<SessionAttendanceExportRow[]>> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Not authenticated." }
  if (!canExport(session, "Events")) return { success: false, error: "Unauthorized." }

  try {
    const occurrences = await db.eventOccurrence.findMany({
      where: { eventId, ...(occurrenceId ? { id: occurrenceId } : {}) },
      orderBy: { date: "asc" },
      select: {
        date: true,
        series: { select: { title: true } },
        attendees: {
          orderBy: { checkedInAt: "asc" },
          select: {
            checkedInAt: true,
            registrant: {
              select: {
                memberId: true,
                firstName: true,
                lastName: true,
                mobileNumber: true,
                member: { select: { firstName: true, lastName: true, phone: true } },
                guest: { select: { firstName: true, lastName: true, phone: true } },
              },
            },
            volunteer: {
              select: {
                member: { select: { firstName: true, lastName: true, phone: true } },
              },
            },
          },
        },
      },
    })

    const rows: SessionAttendanceExportRow[] = occurrences.flatMap((occurrence) => {
      const sessionDate = occurrence.date.toISOString().split("T")[0]
      const seriesTitle = occurrence.series?.title ?? null

      return occurrence.attendees.map((attendee) => {
        if (attendee.volunteer) {
          return {
            sessionDate,
            seriesTitle,
            firstName: attendee.volunteer.member.firstName,
            lastName: attendee.volunteer.member.lastName,
            mobile: attendee.volunteer.member.phone ?? "",
            type: "Volunteer" as const,
            checkedInAt: attendee.checkedInAt.toISOString(),
          }
        }

        const registrant = attendee.registrant
        return {
          sessionDate,
          seriesTitle,
          firstName:
            registrant?.member?.firstName ?? registrant?.guest?.firstName ?? registrant?.firstName ?? "",
          lastName:
            registrant?.member?.lastName ?? registrant?.guest?.lastName ?? registrant?.lastName ?? "",
          mobile:
            registrant?.member?.phone ?? registrant?.guest?.phone ?? registrant?.mobileNumber ?? "",
          type: registrant?.memberId ? ("Member" as const) : ("Guest" as const),
          checkedInAt: attendee.checkedInAt.toISOString(),
        }
      })
    })

    return { success: true, data: rows }
  } catch {
    return { success: false, error: "Failed to export attendance." }
  }
}
