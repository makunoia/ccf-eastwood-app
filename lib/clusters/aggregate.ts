import "server-only"

import { db } from "@/lib/db"
import { canAccessEvent } from "@/lib/permissions"
import type { Session } from "next-auth"
import type { EventType } from "@/app/generated/prisma/client"
import type { ClusterRegistrationExportRow } from "@/lib/export-entities"
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
  price: number | null
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
          price: true,
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

/**
 * Flat registration records for the cluster's CSV export — one row per
 * `EventRegistrant`, not per person, so a person on three of the day's events
 * exports three rows. Scoped to the events this user may see; check-in state is
 * scoped to the cluster's day exactly like the roster.
 */
export async function getClusterRegistrationExportRows(
  session: Session | null,
  clusterId: string
): Promise<ClusterRegistrationExportRow[]> {
  const [cluster, events] = await Promise.all([
    db.eventCluster.findUnique({
      where: { id: clusterId },
      select: { date: true },
    }),
    getAccessibleClusterEvents(session, clusterId),
  ])
  if (!cluster || events.length === 0) return []

  const eventOrder = new Map(events.map((e, i) => [e.id, i]))
  const occurrenceFilter = cluster.date
    ? { where: { occurrence: { date: utcDayRange(cluster.date) } } }
    : {}

  const registrants = await db.eventRegistrant.findMany({
    where: { eventId: { in: events.map((e) => e.id) } },
    select: {
      eventId: true,
      memberId: true,
      firstName: true,
      lastName: true,
      nickname: true,
      email: true,
      mobileNumber: true,
      isPaid: true,
      paymentReference: true,
      attendedAt: true,
      createdAt: true,
      registrationClusterId: true,
      member: {
        select: {
          firstName: true,
          lastName: true,
          nickname: true,
          email: true,
          phone: true,
        },
      },
      guest: {
        select: {
          firstName: true,
          lastName: true,
          nickname: true,
          email: true,
          phone: true,
        },
      },
      event: { select: { name: true, type: true } },
      occurrenceAttendances: {
        ...occurrenceFilter,
        orderBy: { checkedInAt: "asc" },
        select: { checkedInAt: true },
        take: 1,
      },
    },
  })

  const rows = registrants.map((r) => {
    // OneTime events check in via attendedAt; session events via occurrences.
    const checkedInAt =
      r.event.type === "OneTime"
        ? r.attendedAt
        : (r.occurrenceAttendances[0]?.checkedInAt ?? null)
    return {
      eventId: r.eventId,
      eventName: r.event.name,
      firstName: r.member?.firstName ?? r.guest?.firstName ?? r.firstName ?? "",
      lastName: r.member?.lastName ?? r.guest?.lastName ?? r.lastName ?? "",
      nickname: r.member?.nickname ?? r.guest?.nickname ?? r.nickname ?? null,
      email: r.member?.email ?? r.guest?.email ?? r.email ?? null,
      mobile: r.member?.phone ?? r.guest?.phone ?? r.mobileNumber ?? "",
      type: (r.memberId ? "Member" : "Guest") as "Member" | "Guest",
      registeredAt: r.createdAt.toISOString(),
      viaSharedForm: r.registrationClusterId !== null,
      checkedIn: checkedInAt !== null,
      checkedInAt: checkedInAt?.toISOString() ?? null,
      isPaid: r.isPaid,
      paymentReference: r.paymentReference,
    }
  })

  // Cluster order first (the order the day runs in), then the roster's
  // last-name/first-name ordering so both screens read the same way.
  rows.sort((a, b) => {
    const orderCmp =
      (eventOrder.get(a.eventId) ?? 0) - (eventOrder.get(b.eventId) ?? 0)
    if (orderCmp !== 0) return orderCmp
    const lastCmp = a.lastName.localeCompare(b.lastName, undefined, {
      sensitivity: "base",
    })
    if (lastCmp !== 0) return lastCmp
    return a.firstName.localeCompare(b.firstName, undefined, {
      sensitivity: "base",
    })
  })

  return rows.map(({ eventId: _eventId, ...row }) => row)
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
