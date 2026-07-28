import "server-only"

import { db } from "@/lib/db"
import { canAccessEvent } from "@/lib/permissions"
import type { Session } from "next-auth"
import type { EventType } from "@/app/generated/prisma/client"
import {
  buildClusterRoster,
  type ClusterRegistrantRow,
  type ClusterRosterEvent,
} from "./roster"

/**
 * Cluster workspace aggregation (CCF-132). Everything here is scoped to the
 * events the current user is allowed to see: a Staff user with partial event
 * access gets figures computed over their permitted subset only.
 */

export type AccessibleClusterEvent = ClusterRosterEvent & {
  startDate: Date
  registrationStart: Date | null
  registrationEnd: Date | null
}

/** The cluster's member events this user may see, in cluster order. */
export async function getAccessibleClusterEvents(
  session: Session | null,
  clusterId: string
): Promise<AccessibleClusterEvent[]> {
  const rows = await db.eventClusterEvent.findMany({
    where: { clusterId },
    orderBy: { order: "asc" },
    select: {
      event: {
        select: {
          id: true,
          name: true,
          type: true,
          startDate: true,
          registrationStart: true,
          registrationEnd: true,
        },
      },
    },
  })
  return rows
    .map((r) => r.event)
    .filter((e) => canAccessEvent(session, e.id))
}

/** Flat registrant rows (with check-in state) for a set of cluster events. */
export async function getClusterRegistrantRows(
  eventIds: string[]
): Promise<ClusterRegistrantRow[]> {
  if (eventIds.length === 0) return []
  const registrants = await db.eventRegistrant.findMany({
    where: { eventId: { in: eventIds } },
    select: {
      id: true,
      eventId: true,
      memberId: true,
      guestId: true,
      firstName: true,
      lastName: true,
      attendedAt: true,
      createdAt: true,
      registrationClusterId: true,
      member: { select: { firstName: true, lastName: true, phone: true } },
      guest: { select: { firstName: true, lastName: true, phone: true } },
      event: { select: { type: true } },
      occurrenceAttendances: { select: { id: true }, take: 1 },
    },
  })
  return registrants.map((r) => ({
    id: r.id,
    eventId: r.eventId,
    memberId: r.memberId,
    guestId: r.guestId,
    firstName: r.member?.firstName ?? r.guest?.firstName ?? r.firstName ?? "",
    lastName: r.member?.lastName ?? r.guest?.lastName ?? r.lastName ?? "",
    phone: r.member?.phone ?? r.guest?.phone ?? null,
    isMember: r.memberId !== null,
    // OneTime events check in via attendedAt; session events via occurrences.
    checkedIn:
      r.event.type === "OneTime"
        ? r.attendedAt !== null
        : r.occurrenceAttendances.length > 0,
    viaCluster: r.registrationClusterId !== null,
    registeredAt: r.createdAt,
  }))
}

export type ClusterEventStat = {
  eventId: string
  name: string
  type: EventType
  registered: number
  checkedIn: number
}

export type ClusterOverview = {
  events: AccessibleClusterEvent[]
  eventStats: ClusterEventStat[]
  roster: ReturnType<typeof buildClusterRoster>
  totals: {
    registrations: number
    uniquePeople: number
    checkedInPeople: number
    viaClusterForm: number
  }
}

/** Dashboard roll-up: per-event tiles + combined roster matrix + day totals. */
export async function getClusterOverview(
  session: Session | null,
  clusterId: string
): Promise<ClusterOverview> {
  const events = await getAccessibleClusterEvents(session, clusterId)
  const rows = await getClusterRegistrantRows(events.map((e) => e.id))
  const roster = buildClusterRoster(events, rows)

  const eventStats: ClusterEventStat[] = events.map((e) => {
    const eventRows = rows.filter((r) => r.eventId === e.id)
    return {
      eventId: e.id,
      name: e.name,
      type: e.type,
      registered: eventRows.length,
      checkedIn: eventRows.filter((r) => r.checkedIn).length,
    }
  })

  return {
    events,
    eventStats,
    roster,
    totals: {
      registrations: rows.length,
      uniquePeople: roster.rows.length,
      checkedInPeople: roster.rows.filter((p) =>
        Object.values(p.perEvent).some((cell) => cell?.checkedIn)
      ).length,
      viaClusterForm: rows.filter((r) => r.viaCluster).length,
    },
  }
}
