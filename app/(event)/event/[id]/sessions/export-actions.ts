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
                nickname: true,
                email: true,
                mobileNumber: true,
                member: {
                  select: {
                    firstName: true,
                    lastName: true,
                    nickname: true,
                    phone: true,
                    email: true,
                  },
                },
                guest: {
                  select: {
                    firstName: true,
                    lastName: true,
                    nickname: true,
                    phone: true,
                    email: true,
                  },
                },
              },
            },
            volunteer: {
              select: {
                member: {
                  select: {
                    firstName: true,
                    lastName: true,
                    nickname: true,
                    phone: true,
                    email: true,
                  },
                },
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
          const member = attendee.volunteer.member
          return {
            sessionDate,
            seriesTitle,
            firstName: member.firstName,
            lastName: member.lastName,
            nickname: member.nickname ?? null,
            mobile: member.phone ?? "",
            email: member.email ?? null,
            type: "Volunteer" as const,
            checkedInAt: attendee.checkedInAt.toISOString(),
          }
        }

        const registrant = attendee.registrant
        const person = registrant?.member ?? registrant?.guest ?? null
        return {
          sessionDate,
          seriesTitle,
          firstName:
            registrant?.member?.firstName ?? registrant?.guest?.firstName ?? registrant?.firstName ?? "",
          lastName:
            registrant?.member?.lastName ?? registrant?.guest?.lastName ?? registrant?.lastName ?? "",
          // The per-event nickname wins over the profile's — same precedence the
          // registrant list and check-in search use.
          nickname: registrant?.nickname ?? person?.nickname ?? null,
          mobile: person?.phone ?? registrant?.mobileNumber ?? "",
          email: person?.email ?? registrant?.email ?? null,
          type: registrant?.memberId ? ("Member" as const) : ("Guest" as const),
          checkedInAt: attendee.checkedInAt.toISOString(),
        }
      })
    })

    return { success: true, data: { rows, columns: buildSessionAttendanceColumns(rows) } }
  } catch {
    return { success: false, error: "Failed to export attendance." }
  }
}
