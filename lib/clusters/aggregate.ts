import "server-only"

import { db } from "@/lib/db"
import { canAccessEvent } from "@/lib/permissions"
import type { Session } from "next-auth"
import type { EventType } from "@/app/generated/prisma/client"
import { getHouseholdLabels } from "@/lib/family-links"
import { FORM_CONTEXTS, type EventFormConfigData } from "@/lib/forms/context-config"
import {
  getClusterFormConfigs,
  getEffectiveFormConfigs,
} from "@/lib/forms/context-config-server"
import {
  formatBirthDate,
  formatDietary,
  formatLanguages,
  formatMeetingPreference,
  formatSchedule,
  unionFormConfigs,
} from "@/lib/forms/registration-responses"
import {
  buildClusterExportColumns,
  type ClusterExportColumnState,
  type ClusterRegistrationExportRow,
} from "@/lib/exports/cluster-registrations"
import {
  buildClusterRoster,
  isOnClusterDay,
  personKeyFor,
  type ClusterDayScope,
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
  /** The session this cluster day stands for (Recurring links only; null = legacy date-window link). */
  linkedOccurrenceId: string | null
  linkedOccurrenceDate: Date | null
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
      occurrenceId: true,
      occurrence: { select: { date: true } },
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
    .map((r) => ({
      ...r.event,
      linkedOccurrenceId: r.occurrenceId,
      linkedOccurrenceDate: r.occurrence?.date ?? null,
    }))
    .filter((e) => canAccessEvent(session, e.id))
}

/**
 * UTC day bounds for a cluster date. Cluster dates are stored as a bare day
 * (rendered with `timeZone: "UTC"` on the dashboard), so the window has to be
 * computed in UTC to match — a local-time window would slide by 8 hours here.
 */
export function utcDayRange(date: Date): { gte: Date; lt: Date } {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)
  return { gte: start, lt: end }
}

/** The per-event input the day roll-up needs: identity plus the linked session, if any. */
export type ClusterScopedEvent = {
  id: string
  linkedOccurrenceId?: string | null
}

/**
 * The occurrence-attendance relation filter for a set of cluster events. Session
 * scoping is per event — a link with an explicit session reads THAT occurrence;
 * a legacy link (null) reads the cluster date's occurrence; a dateless cluster
 * reads any occurrence. One query can't vary the filter per row, so this casts
 * the union as an OR and `pickAttendance` narrows per registrant afterwards.
 *
 * A registrant belongs to exactly one event, so the branches can't crowd each
 * other out: a linked event's registrant matches at most two rows (the linked
 * session + the date's occurrence, usually the same one), and an unlinked
 * event's registrant only needs existence — which is why a small `take` is safe.
 */
function occurrenceScopeFilter(
  events: ClusterScopedEvent[],
  scope: ClusterDayScope | null
) {
  const linkedIds = events
    .map((e) => e.linkedOccurrenceId)
    .filter((id): id is string => !!id)
  const or: object[] = []
  if (linkedIds.length > 0) or.push({ occurrenceId: { in: linkedIds } })
  if (scope?.date) {
    or.push({ occurrence: { date: utcDayRange(scope.date) } })
  } else {
    // No date to window by — unlinked events keep the unscoped "any attendance"
    // reading, expressed by matching their own occurrences unconditionally.
    const unlinkedEventIds = events
      .filter((e) => !e.linkedOccurrenceId)
      .map((e) => e.id)
    if (unlinkedEventIds.length > 0) {
      or.push({ occurrence: { eventId: { in: unlinkedEventIds } } })
    }
  }
  return or.length > 0 ? { where: { OR: or } } : {}
}

/** The attendance rows that count for this registrant, given its event's linked session. */
function pickAttendance<T extends { occurrenceId: string }>(
  attendances: T[],
  linkedOccurrenceId: string | null
): T[] {
  if (!linkedOccurrenceId) return attendances
  return attendances.filter((a) => a.occurrenceId === linkedOccurrenceId)
}

/**
 * Flat registrant rows (with check-in state) for a set of cluster events,
 * scoped to the day the cluster represents.
 *
 * `scope` does two jobs, both about the same fact: a cluster is one day, while a
 * MultiDay/Recurring event spans many.
 *
 *  - **Attendance** is read from the linked session when the cluster names one,
 *    else from occurrences on the cluster's date — without either, anyone who
 *    attended ANY past session showed as checked in on today's roster.
 *  - **Registration** is filtered by `isOnClusterDay` — without it, every person
 *    who ever registered for the weekly service appeared on every cluster day
 *    containing it, whether or not they came.
 *
 * A null scope (or a cluster with no date and no linked sessions) keeps the
 * unscoped behavior: there is no day to scope to.
 */
export async function getClusterRegistrantRows(
  events: ClusterScopedEvent[],
  scope: ClusterDayScope | null = null
): Promise<ClusterRegistrantRow[]> {
  if (events.length === 0) return []
  const linkedByEvent = new Map(
    events.map((e) => [e.id, e.linkedOccurrenceId ?? null])
  )
  const registrants = await db.eventRegistrant.findMany({
    where: { eventId: { in: events.map((e) => e.id) } },
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
      occurrenceAttendances: {
        ...occurrenceScopeFilter(events, scope),
        select: { occurrenceId: true },
        take: 3,
      },
    },
  })
  return registrants
    .map((r) => {
      const linked = linkedByEvent.get(r.eventId) ?? null
      return {
        id: r.id,
        eventId: r.eventId,
        eventType: r.event.type,
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
            : pickAttendance(r.occurrenceAttendances, linked).length > 0,
        hasLinkedSession: linked !== null,
        registrationClusterId: r.registrationClusterId,
        registeredAt: r.createdAt,
      }
    })
    .filter((row) => isOnClusterDay(row, scope))
}

/**
 * Total registrations per event, unscoped by day — the whole series for a
 * Recurring/MultiDay event. Shown alongside the day figure so the standing
 * roster stays visible without being mistaken for the day's attendance.
 */
export async function getClusterSeriesTotals(
  eventIds: string[]
): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map()
  const grouped = await db.eventRegistrant.groupBy({
    by: ["eventId"],
    where: { eventId: { in: eventIds } },
    _count: { _all: true },
  })
  return new Map(grouped.map((g) => [g.eventId, g._count._all]))
}

/**
 * PEOPLE who signed up through each cluster's shared form — not registrations.
 * One person ticking three events on the shared link is one person here, which
 * is what the clusters list means by its count. Keyed the same way as the
 * dashboard's `viaSharedLinkPeople` so both figures agree.
 */
export async function getClusterSharedFormPeopleCounts(
  clusterIds: string[]
): Promise<Map<string, number>> {
  if (clusterIds.length === 0) return new Map()
  const rows = await db.eventRegistrant.findMany({
    where: { registrationClusterId: { in: clusterIds } },
    select: { id: true, memberId: true, guestId: true, registrationClusterId: true },
  })
  const byCluster = new Map<string, Set<string>>()
  for (const row of rows) {
    const clusterId = row.registrationClusterId
    if (!clusterId) continue
    let people = byCluster.get(clusterId)
    if (!people) {
      people = new Set()
      byCluster.set(clusterId, people)
    }
    people.add(personKeyFor(row))
  }
  return new Map([...byCluster].map(([id, people]) => [id, people.size]))
}

/** Personal/matching fields, selected identically for Member and Guest. */
const PERSON_PROFILE_SELECT = {
  nickname: true,
  email: true,
  phone: true,
  gender: true,
  birthMonth: true,
  birthYear: true,
  workCity: true,
  language: true,
  meetingPreference: true,
  lifeStage: { select: { name: true } },
  ageRangeBucket: { select: { label: true } },
} as const

/**
 * Flat registration records for the cluster's CSV export — one row per
 * `EventRegistrant`, not per person, so a person on three of the day's events
 * exports three rows. Scoped to the events this user may see; check-in state is
 * scoped to the cluster's day exactly like the roster.
 *
 * Every answer the registration form can gather is resolved here, in the same
 * precedence the registrant detail page uses (per-event value → Member → Guest →
 * the registrant's own columns). Which of them an admin actually gets is decided
 * later, by the column picker.
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
  const linkedByEvent = new Map(events.map((e) => [e.id, e.linkedOccurrenceId]))
  const scope: ClusterDayScope = { clusterId, date: cluster.date }

  const registrants = await db.eventRegistrant.findMany({
    where: { eventId: { in: events.map((e) => e.id) } },
    select: {
      eventId: true,
      memberId: true,
      guestId: true,
      firstName: true,
      lastName: true,
      nickname: true,
      email: true,
      mobileNumber: true,
      dietaryPreference: true,
      dietaryOther: true,
      isPaid: true,
      paymentReference: true,
      attendedAt: true,
      createdAt: true,
      registrationClusterId: true,
      member: {
        select: {
          firstName: true,
          lastName: true,
          ...PERSON_PROFILE_SELECT,
          schedulePreferences: {
            select: { dayOfWeek: true, timeStart: true, timeEnd: true },
            orderBy: { dayOfWeek: "asc" },
            take: 1,
          },
        },
      },
      guest: {
        select: {
          firstName: true,
          lastName: true,
          ...PERSON_PROFILE_SELECT,
          scheduleDayOfWeek: true,
          scheduleTimeStart: true,
          scheduleTimeEnd: true,
          claimedSmallGroup: { select: { name: true } },
          claimedSatellite: true,
        },
      },
      event: { select: { name: true, type: true } },
      occurrenceAttendances: {
        ...occurrenceScopeFilter(events, scope),
        orderBy: { checkedInAt: "asc" },
        select: { occurrenceId: true, checkedInAt: true },
        take: 5,
      },
      breakoutGroupMemberships: {
        select: { breakoutGroup: { select: { name: true } } },
        orderBy: { assignedAt: "asc" },
      },
    },
  })

  const households = await getHouseholdLabels(
    registrants.map((r) => ({ memberId: r.memberId, guestId: r.guestId }))
  )

  const rows = registrants.map((r) => {
    const linked = linkedByEvent.get(r.eventId) ?? null
    // OneTime events check in via attendedAt; session events via occurrences.
    const checkedInAt =
      r.event.type === "OneTime"
        ? r.attendedAt
        : (pickAttendance(r.occurrenceAttendances, linked)[0]?.checkedInAt ?? null)
    const person = r.member ?? r.guest ?? null
    const memberSchedule = r.member?.schedulePreferences?.[0] ?? null
    const householdKey = r.memberId
      ? `member:${r.memberId}`
      : r.guestId
        ? `guest:${r.guestId}`
        : null

    return {
      eventId: r.eventId,
      eventType: r.event.type,
      hasLinkedSession: linked !== null,
      eventName: r.event.name,
      firstName: r.member?.firstName ?? r.guest?.firstName ?? r.firstName ?? "",
      lastName: r.member?.lastName ?? r.guest?.lastName ?? r.lastName ?? "",
      // The per-event nickname wins over the one on the profile — same
      // precedence the registrant list and check-in search use.
      nickname: r.nickname ?? person?.nickname ?? null,
      email: person?.email ?? r.email ?? null,
      mobile: person?.phone ?? r.mobileNumber ?? "",
      type: (r.memberId ? "Member" : "Guest") as "Member" | "Guest",
      registeredAt: r.createdAt.toISOString(),
      registrationClusterId: r.registrationClusterId,
      viaSharedForm: r.registrationClusterId === clusterId,
      checkedIn: checkedInAt !== null,
      checkedInAt: checkedInAt?.toISOString() ?? null,

      lifeStage: person?.lifeStage?.name ?? null,
      birthDate: formatBirthDate(person?.birthMonth ?? null, person?.birthYear ?? null),
      ageRange: person?.ageRangeBucket?.label ?? null,
      gender: person?.gender ?? null,
      language: formatLanguages(person?.language),
      meetingPreference: formatMeetingPreference(person?.meetingPreference ?? null),
      schedule: r.guest
        ? formatSchedule(
            r.guest.scheduleDayOfWeek,
            r.guest.scheduleTimeStart,
            r.guest.scheduleTimeEnd
          )
        : formatSchedule(
            memberSchedule?.dayOfWeek ?? null,
            memberSchedule?.timeStart ?? null,
            memberSchedule?.timeEnd ?? null
          ),
      workCity: person?.workCity ?? null,
      claimedSmallGroup:
        r.guest?.claimedSmallGroup?.name ??
        (r.guest?.claimedSatellite
          ? `${r.guest.claimedSatellite} (another satellite)`
          : null),
      breakoutGroup:
        r.breakoutGroupMemberships.map((m) => m.breakoutGroup.name).join("; ") || null,
      household: (householdKey && households.get(householdKey)) || null,
      dietary: formatDietary(r.dietaryPreference, r.dietaryOther),
      isPaid: r.isPaid,
      paymentReference: r.paymentReference,
    }
  })

  // Same day scope as the roster and the dashboard — an export launched from
  // the registrants screen must describe the day that screen is showing, not a
  // Recurring event's whole standing roster.
  const dayRows = rows.filter((row) => isOnClusterDay(row, scope))

  // Cluster order first (the order the day runs in), then the roster's
  // last-name/first-name ordering so both screens read the same way.
  dayRows.sort((a, b) => {
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

  return dayRows.map(
    ({
      eventId: _eventId,
      eventType: _eventType,
      hasLinkedSession: _linked,
      registrationClusterId: _clusterId,
      ...row
    }) => row
  )
}

/**
 * What the cluster's forms gather: the OR-union of every member event's
 * effective config (all three contexts) and the cluster's own shared form. A
 * registration can arrive through any of them, so a field counts as asked if
 * any one of them asks it.
 */
export async function getClusterFormCoverage(
  session: Session | null,
  clusterId: string
): Promise<EventFormConfigData> {
  const events = await getAccessibleClusterEvents(session, clusterId)
  const [clusterConfigs, eventConfigs] = await Promise.all([
    getClusterFormConfigs(clusterId),
    Promise.all(events.map((e) => getEffectiveFormConfigs(e.id))),
  ])
  return unionFormConfigs([
    ...FORM_CONTEXTS.map((ctx) => clusterConfigs[ctx]),
    ...eventConfigs.flatMap((configs) => FORM_CONTEXTS.map((ctx) => configs[ctx])),
  ])
}

/** Export payload for the cluster registrants screen: rows + column offer. */
export async function getClusterRegistrationExport(
  session: Session | null,
  clusterId: string
): Promise<{
  rows: ClusterRegistrationExportRow[]
  columns: ClusterExportColumnState[]
}> {
  const [rows, coverage] = await Promise.all([
    getClusterRegistrationExportRows(session, clusterId),
    getClusterFormCoverage(session, clusterId),
  ])
  return { rows, columns: buildClusterExportColumns(coverage, rows) }
}

export type ClusterEventStat = {
  eventId: string
  name: string
  type: EventType
  /** Registrations belonging to the cluster's day. */
  registered: number
  /** Every registration for the event, across all its dates. */
  seriesRegistered: number
  checkedIn: number
  /** The session this day is scoped to, when the link names one. */
  linkedOccurrenceDate: Date | null
}

export type ClusterOverview = {
  events: AccessibleClusterEvent[]
  eventStats: ClusterEventStat[]
  roster: ReturnType<typeof buildClusterRoster>
  totals: {
    registrations: number
    uniquePeople: number
    checkedInPeople: number
    /**
     * PEOPLE who signed up through this day's shared link — not registrations.
     * One person ticking three events on that link is one person here, so the
     * figure is comparable to `uniquePeople` sitting next to it.
     */
    viaSharedLinkPeople: number
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
  const eventIds = events.map((e) => e.id)
  const [rows, seriesTotals] = await Promise.all([
    getClusterRegistrantRows(
      events,
      cluster ? { clusterId, date: cluster.date } : null
    ),
    getClusterSeriesTotals(eventIds),
  ])
  const roster = buildClusterRoster(events, rows)

  const eventStats: ClusterEventStat[] = events.map((e) => {
    const eventRows = rows.filter((r) => r.eventId === e.id)
    return {
      eventId: e.id,
      name: e.name,
      type: e.type,
      registered: eventRows.length,
      seriesRegistered: seriesTotals.get(e.id) ?? 0,
      checkedIn: eventRows.filter((r) => r.checkedIn).length,
      linkedOccurrenceDate: e.linkedOccurrenceDate,
    }
  })

  const viaSharedLink = new Set(
    rows
      .filter((r) => r.registrationClusterId === clusterId)
      .map((r) => personKeyFor(r))
  )

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
      viaSharedLinkPeople: viaSharedLink.size,
    },
  }
}
