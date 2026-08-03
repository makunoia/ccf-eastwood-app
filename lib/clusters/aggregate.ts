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

/**
 * UTC day bounds for a cluster date. Cluster dates are stored as a bare day
 * (rendered with `timeZone: "UTC"` on the dashboard), so the window has to be
 * computed in UTC to match — a local-time window would slide by 8 hours here.
 */
function utcDayRange(date: Date): { gte: Date; lt: Date } {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)
  return { gte: start, lt: end }
}

/**
 * Flat registrant rows (with check-in state) for a set of cluster events.
 *
 * `clusterDate` scopes session attendance to the day the cluster represents. A
 * cluster is one day's worth of events, but a MultiDay/Recurring event's
 * occurrences span many days — without this, anyone who attended ANY past
 * session of that event showed as checked in on today's roster.
 * Null (a cluster with no date set) keeps the unscoped behavior: there is no
 * day to scope to.
 */
export async function getClusterRegistrantRows(
  eventIds: string[],
  clusterDate: Date | null = null
): Promise<ClusterRegistrantRow[]> {
  if (eventIds.length === 0) return []
  const occurrenceFilter = clusterDate
    ? { where: { occurrence: { date: utcDayRange(clusterDate) } } }
    : {}
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
      occurrenceAttendances: { ...occurrenceFilter, select: { id: true }, take: 1 },
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
  const [cluster, events] = await Promise.all([
    db.eventCluster.findUnique({
      where: { id: clusterId },
      select: { date: true },
    }),
    getAccessibleClusterEvents(session, clusterId),
  ])
  const rows = await getClusterRegistrantRows(
    events.map((e) => e.id),
    cluster?.date ?? null
  )
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
