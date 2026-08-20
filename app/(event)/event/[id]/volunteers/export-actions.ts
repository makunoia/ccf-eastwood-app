"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canAccessEvent, canExport } from "@/lib/permissions"
import { formatBirthDate } from "@/lib/forms/registration-responses"
import {
  buildEventVolunteerColumns,
  type EventVolunteerExportRow,
  type VolunteerExportColumnState,
} from "@/lib/exports/event-volunteers"

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export type EventVolunteersExportPayload = {
  rows: EventVolunteerExportRow[]
  columns: VolunteerExportColumnState[]
}

/**
 * The event's serving roster as export rows — one per `Volunteer`.
 *
 * Read here rather than handed down from the page: the page ships only what the
 * table renders, and the export wants the whole profile plus bus assignments.
 * Precomputing all of that into the client payload would cost every visitor the
 * bytes for a file most of them never download.
 */
export async function getEventVolunteersExport(
  eventId: string,
): Promise<ActionResult<EventVolunteersExportPayload>> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Not authenticated." }
  if (!canExport(session, "Events")) return { success: false, error: "Unauthorized." }
  if (!canAccessEvent(session, eventId)) return { success: false, error: "Unauthorized." }

  try {
    const [volunteers, modules] = await Promise.all([
      db.volunteer.findMany({
        where: { eventId },
        orderBy: [{ member: { lastName: "asc" } }, { member: { firstName: "asc" } }],
        select: {
          id: true,
          status: true,
          notes: true,
          leaderNotes: true,
          createdAt: true,
          member: {
            select: {
              firstName: true,
              lastName: true,
              nickname: true,
              email: true,
              phone: true,
              gender: true,
              birthMonth: true,
              birthYear: true,
              lifeStage: { select: { name: true } },
              smallGroup: { select: { name: true } },
            },
          },
          committee: { select: { name: true } },
          preferredRole: { select: { name: true } },
          assignedRole: { select: { name: true } },
          busPassengers: {
            select: { bus: { select: { name: true, direction: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      db.eventModule.findMany({ where: { eventId }, select: { type: true } }),
    ])

    const rows: EventVolunteerExportRow[] = volunteers.map((v) => ({
      volunteerId: v.id,
      firstName: v.member.firstName,
      lastName: v.member.lastName,
      nickname: v.member.nickname,
      email: v.member.email,
      phone: v.member.phone,
      lifeStage: v.member.lifeStage?.name ?? null,
      gender: v.member.gender,
      birthDate: formatBirthDate(v.member.birthMonth, v.member.birthYear),
      smallGroup: v.member.smallGroup?.name ?? null,

      committeeName: v.committee.name,
      preferredRole: v.preferredRole.name,
      assignedRole: v.assignedRole?.name ?? null,
      status: v.status,
      notes: v.notes,
      leaderNotes: v.leaderNotes,
      signedUpAt: v.createdAt.toISOString(),

      bus: v.busPassengers.map((p) => p.bus.name).join("; ") || null,
      busDirection: v.busPassengers.map((p) => p.bus.direction).join("; ") || null,
    }))

    return {
      success: true,
      data: {
        rows,
        columns: buildEventVolunteerColumns(
          modules.map((m) => m.type),
          rows,
        ),
      },
    }
  } catch {
    return { success: false, error: "Failed to export volunteers." }
  }
}
