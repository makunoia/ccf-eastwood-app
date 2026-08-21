"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canExport } from "@/lib/permissions"
import { formatBirthDate } from "@/lib/forms/registration-responses"
import { getAccessibleClusterEvents } from "@/lib/clusters/aggregate"
import { clusterEventMinistryLabel } from "@/lib/clusters/ministry-label"
import {
  buildClusterVolunteerColumns,
  type ClusterVolunteerExportRow,
  type ClusterVolunteerExportColumnState,
} from "@/lib/exports/cluster-volunteers"

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export type ClusterVolunteersExportPayload = {
  rows: ClusterVolunteerExportRow[]
  columns: ClusterVolunteerExportColumnState[]
}

/**
 * The day's serving team as export rows.
 *
 * `scope` mirrors the screen's two tabs exactly, and it has to: an export that
 * silently described a different set from the list it was launched from is the
 * failure mode the export convention exists to prevent. `"day"` is the day's own
 * sign-ups, `"all"` the union of both standing rosters.
 *
 * Event access is applied through `getAccessibleClusterEvents`, the same
 * narrowing the page uses, so a staff user exports the ministry they can see and
 * not the partner's — `canExport` alone would let the whole day out.
 */
export async function getClusterVolunteersExport(
  clusterId: string,
  scope: "day" | "all",
): Promise<ActionResult<ClusterVolunteersExportPayload>> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Not authenticated." }
  if (!canExport(session, "Events")) return { success: false, error: "Unauthorized." }

  try {
    const events = await getAccessibleClusterEvents(session, clusterId)
    const eventIds = events.map((e) => e.id)
    if (eventIds.length === 0) {
      return { success: true, data: { rows: [], columns: [] } }
    }

    const [eventMinistries, volunteers, modules] = await Promise.all([
      db.event.findMany({
        where: { id: { in: eventIds } },
        select: {
          id: true,
          name: true,
          allMinistries: true,
          ministries: { select: { ministry: { select: { name: true } } } },
        },
      }),
      db.volunteer.findMany({
        where: {
          eventId: { in: eventIds },
          ...(scope === "day" ? { signUpClusterId: clusterId } : {}),
        },
        orderBy: [{ member: { lastName: "asc" } }, { member: { firstName: "asc" } }],
        select: {
          id: true,
          eventId: true,
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
      // The union across the day's events — a bus assignment belongs to the row's
      // own event, and gating on one ministry's modules would drop the other's.
      db.eventModule.findMany({
        where: { eventId: { in: eventIds } },
        select: { type: true },
      }),
    ])

    const ministryByEvent = new Map(
      eventMinistries.map((e) => [e.id, clusterEventMinistryLabel(e)]),
    )

    const rows: ClusterVolunteerExportRow[] = volunteers.map((v) => ({
      volunteerId: v.id,
      ministry: ministryByEvent.get(v.eventId) ?? "",
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
        columns: buildClusterVolunteerColumns(
          [...new Set(modules.map((m) => m.type))],
          rows,
        ),
      },
    }
  } catch {
    return { success: false, error: "Failed to export volunteers." }
  }
}
