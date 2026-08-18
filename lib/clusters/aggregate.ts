import "server-only"

import { db } from "@/lib/db"
import { canAccessEvent } from "@/lib/permissions"
import type { Session } from "next-auth"
import type { EventType } from "@/app/generated/prisma/client"
import { getHouseholdLabels } from "@/lib/family-links"
import { allTokensMatch } from "@/lib/search/name-search"
import { breakoutGroupsInclude } from "@/lib/breakouts/queries"
import { unassignedCandidateWhere } from "@/lib/breakouts/candidate-pool"
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
  PARTICIPATION_RANK,
  type ClusterExportColumnState,
  type ClusterExportEvent,
  type ClusterParticipation,
  type ClusterRegistrationExportRow,
} from "@/lib/exports/cluster-registrations"
import {
  resolveClusterCheckinShortcut,
  type ClusterCheckinShortcut,
} from "./checkin-shortcuts"
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

/**
 * All of the cluster's member events, in cluster order, unfiltered by permission.
 *
 * For the public surfaces, which have no session to scope by — the kiosk serves
 * whoever holds the day's link and must see the whole day. Authenticated callers
 * want {@link getAccessibleClusterEvents}.
 */
export async function getClusterEvents(
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
  return rows.map((r) => ({
    ...r.event,
    linkedOccurrenceId: r.occurrenceId,
    linkedOccurrenceDate: r.occurrence?.date ?? null,
  }))
}

/** The cluster's member events this user may see, in cluster order. */
export async function getAccessibleClusterEvents(
  session: Session | null,
  clusterId: string
): Promise<AccessibleClusterEvent[]> {
  const events = await getClusterEvents(clusterId)
  return events.filter((e) => canAccessEvent(session, e.id))
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
 *  - **Registration** is marked by `isOnClusterDay` — without the distinction,
 *    every person who ever registered for the weekly service counted on every
 *    cluster day containing it, whether or not they came.
 *
 * Rows are **flagged, never dropped**. Day-scoping is a question about counts,
 * and answering it by withholding rows made the roster claim someone was not
 * registered when they were — while the add-registrant screen, reading the same
 * row, refused to add them again. Every count here filters on `onClusterDay`;
 * the surfaces decide for themselves whether to show the rest.
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
  return registrants.map((r) => {
    const linked = linkedByEvent.get(r.eventId) ?? null
    const row = {
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
    return { ...row, onClusterDay: isOnClusterDay(row, scope) }
  })
}

/**
 * Every cluster event's check-in verdict for the day, in cluster order: the
 * status the admin board badges, plus the occurrence the kiosk records against.
 *
 * Resolves the session each event's link should point at — the one the cluster
 * names, else the event's occurrence on the cluster's date — and reads the
 * OneTime Public access switch, then hands both to the pure resolver.
 *
 * Shared by the board's Shortcuts and the public cluster kiosk so the two can
 * never disagree about whether an event is accepting check-ins right now.
 */
export async function resolveClusterCheckinTargets(
  events: AccessibleClusterEvent[],
  clusterDate: Date | null
): Promise<{ shortcut: ClusterCheckinShortcut; occurrenceId: string | null }[]> {
  if (events.length === 0) return []

  const oneTimeIds = events.filter((e) => e.type === "OneTime").map((e) => e.id)
  const sessionEvents = events.filter((e) => e.type !== "OneTime")
  const linkedIds = sessionEvents
    .map((e) => e.linkedOccurrenceId)
    .filter((id): id is string => !!id)
  // Events whose cluster link names no session fall back to the day's occurrence.
  const byDateEventIds = sessionEvents
    .filter((e) => !e.linkedOccurrenceId)
    .map((e) => e.id)

  const occurrenceOr: object[] = []
  if (linkedIds.length > 0) occurrenceOr.push({ id: { in: linkedIds } })
  if (byDateEventIds.length > 0 && clusterDate) {
    occurrenceOr.push({
      eventId: { in: byDateEventIds },
      date: utcDayRange(clusterDate),
    })
  }

  const [occurrences, closedConfigs] = await Promise.all([
    occurrenceOr.length > 0
      ? db.eventOccurrence.findMany({
          where: { OR: occurrenceOr },
          select: { id: true, eventId: true, date: true, isOpen: true },
        })
      : Promise.resolve([]),
    // A missing FormConfig row means open, so only explicit `isOpen: false`
    // counts as closed — same reading as the cluster Forms page.
    oneTimeIds.length > 0
      ? db.formConfig.findMany({
          where: {
            key: "EventCheckIn",
            eventId: { in: oneTimeIds },
            isOpen: false,
          },
          select: { eventId: true },
        })
      : Promise.resolve([]),
  ])

  const byId = new Map(occurrences.map((o) => [o.id, o]))
  const byEvent = new Map(occurrences.map((o) => [o.eventId, o]))
  const closedEventIds = new Set(closedConfigs.map((c) => c.eventId))

  return events.map((event) => {
    const occurrence = event.linkedOccurrenceId
      ? (byId.get(event.linkedOccurrenceId) ?? null)
      : (byEvent.get(event.id) ?? null)
    return {
      shortcut: resolveClusterCheckinShortcut({
        event,
        formIsOpen: !closedEventIds.has(event.id),
        occurrence,
      }),
      occurrenceId: occurrence?.id ?? null,
    }
  })
}

/** Every cluster event's public check-in link, in cluster order. */
export async function getClusterCheckinShortcuts(
  events: AccessibleClusterEvent[],
  clusterDate: Date | null
): Promise<ClusterCheckinShortcut[]> {
  const targets = await resolveClusterCheckinTargets(events, clusterDate)
  return targets.map((t) => t.shortcut)
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

/** First non-null wins — profile answers repeat across a person's registrations. */
function firstOf<T>(existing: T | null, incoming: T | null): T | null {
  return existing ?? incoming
}

/** Union of two semicolon-joined lists, order preserved, duplicates dropped. */
function mergeList(existing: string | null, incoming: string | null): string | null {
  const parts = [existing, incoming]
    .filter((v): v is string => !!v)
    .flatMap((v) => v.split("; "))
  const unique = [...new Set(parts)]
  return unique.length > 0 ? unique.join("; ") : null
}

/** The earlier of two ISO timestamps, ignoring nulls. */
function earlier(existing: string | null, incoming: string | null): string | null {
  if (!existing) return incoming
  if (!incoming) return existing
  return incoming < existing ? incoming : existing
}

/**
 * Registration records for the cluster's CSV export — **one row per person**,
 * not per `EventRegistrant`. Someone on three of the day's events is one row
 * whose `perEvent` map names all three; exporting them three times would repeat
 * their entire profile and break every count in the spreadsheet.
 *
 * Scoped to the events this user may see; check-in state is scoped to the
 * cluster's day exactly like the roster. Identity is the roster's `personKeyFor`
 * — a walk-in with no Member/Guest FK stays its own row, since we have nothing
 * to merge it on.
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
      id: true,
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
      event: { select: { type: true } },
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
    // Computed from `createdAt` itself, not the ISO string below — the day test
    // needs the instant, and stringifying first would hand it a Date-shaped lie.
    const onClusterDay = isOnClusterDay(
      {
        eventType: r.event.type,
        checkedIn: checkedInAt !== null,
        hasLinkedSession: linked !== null,
        registrationClusterId: r.registrationClusterId,
        registeredAt: r.createdAt,
      },
      scope
    )
    const person = r.member ?? r.guest ?? null
    const memberSchedule = r.member?.schedulePreferences?.[0] ?? null
    const householdKey = r.memberId
      ? `member:${r.memberId}`
      : r.guestId
        ? `guest:${r.guestId}`
        : null

    return {
      id: r.id,
      eventId: r.eventId,
      eventType: r.event.type,
      hasLinkedSession: linked !== null,
      onClusterDay,
      memberId: r.memberId,
      guestId: r.guestId,
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
  // the registrants screen must describe the day that screen is showing. The
  // series-only rows travel with it rather than being dropped, carrying their
  // own participation value, so the spreadsheet can distinguish "wasn't here"
  // from "we have no record of them" the way the roster now does.
  //
  // Fold day rows first, then in cluster order: when two registrations disagree
  // on a per-event answer (a nickname, a dietary note) the day's answer wins,
  // and within the day the earlier event does — a stable rule rather than
  // whatever order the database returned.
  rows.sort((a, b) => {
    if (a.onClusterDay !== b.onClusterDay) return a.onClusterDay ? -1 : 1
    return (eventOrder.get(a.eventId) ?? 0) - (eventOrder.get(b.eventId) ?? 0)
  })

  const byPerson = new Map<string, ClusterRegistrationExportRow>()
  // "First registered at" should describe the day when the person has any part
  // in it, so a newly-carried series-only row can never drag an existing row's
  // timestamp backwards. Only someone with nothing but series-only rows falls
  // back to those, which is the one case where it is all we have.
  const dayRegisteredAt = new Map<string, string>()

  for (const row of rows) {
    const {
      id,
      eventId,
      eventType: _eventType,
      hasLinkedSession: _linked,
      onClusterDay,
      memberId,
      guestId,
      registrationClusterId,
      ...fields
    } = row
    const key = personKeyFor({ id, memberId, guestId })
    const participation: ClusterParticipation = fields.checkedIn
      ? "CheckedIn"
      : onClusterDay
        ? "Registered"
        : "SeriesOnly"
    if (onClusterDay) {
      dayRegisteredAt.set(
        key,
        earlier(dayRegisteredAt.get(key) ?? null, fields.registeredAt) ??
          fields.registeredAt
      )
    }
    const existing = byPerson.get(key)

    if (!existing) {
      byPerson.set(key, {
        ...fields,
        personKey: key,
        perEvent: { [eventId]: participation },
        viaSharedForm: registrationClusterId === clusterId,
      })
      continue
    }

    // A person can hold two registrations on the SAME event (a duplicate
    // sign-up); the one that says the most wins.
    const held = existing.perEvent[eventId]
    if (!held || PARTICIPATION_RANK[participation] > PARTICIPATION_RANK[held]) {
      existing.perEvent[eventId] = participation
    }

    existing.registeredAt =
      earlier(existing.registeredAt, fields.registeredAt) ?? existing.registeredAt
    existing.checkedInAt = earlier(existing.checkedInAt, fields.checkedInAt)
    existing.checkedIn = existing.checkedIn || fields.checkedIn
    existing.viaSharedForm =
      existing.viaSharedForm || registrationClusterId === clusterId

    existing.nickname = firstOf(existing.nickname, fields.nickname)
    existing.email = firstOf(existing.email, fields.email)
    existing.mobile = existing.mobile || fields.mobile
    existing.lifeStage = firstOf(existing.lifeStage, fields.lifeStage)
    existing.birthDate = firstOf(existing.birthDate, fields.birthDate)
    existing.ageRange = firstOf(existing.ageRange, fields.ageRange)
    existing.gender = firstOf(existing.gender, fields.gender)
    existing.language = firstOf(existing.language, fields.language)
    existing.meetingPreference = firstOf(
      existing.meetingPreference,
      fields.meetingPreference
    )
    existing.schedule = firstOf(existing.schedule, fields.schedule)
    existing.workCity = firstOf(existing.workCity, fields.workCity)
    existing.claimedSmallGroup = firstOf(
      existing.claimedSmallGroup,
      fields.claimedSmallGroup
    )
    existing.household = firstOf(existing.household, fields.household)
    existing.dietary = firstOf(existing.dietary, fields.dietary)
    // Per-event facts that genuinely differ per registration: keep them all.
    existing.breakoutGroup = mergeList(existing.breakoutGroup, fields.breakoutGroup)
    existing.paymentReference = mergeList(
      existing.paymentReference,
      fields.paymentReference
    )
    existing.isPaid = existing.isPaid || fields.isPaid
  }

  // The roster's last-name/first-name ordering, so the CSV and the registrants
  // screen list the same people in the same order.
  return [...byPerson.values()]
    .map((row) => ({
      ...row,
      registeredAt: dayRegisteredAt.get(row.personKey) ?? row.registeredAt,
    }))
    .sort((a, b) => {
    const lastCmp = a.lastName.localeCompare(b.lastName, undefined, {
      sensitivity: "base",
    })
    if (lastCmp !== 0) return lastCmp
    return a.firstName.localeCompare(b.firstName, undefined, {
      sensitivity: "base",
    })
  })
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

/**
 * Export payload for the cluster registrants screen: rows + column offer + the
 * events themselves, since a row's events are columns now and the client has to
 * build the same registry the offer was computed from.
 */
export async function getClusterRegistrationExport(
  session: Session | null,
  clusterId: string
): Promise<{
  rows: ClusterRegistrationExportRow[]
  columns: ClusterExportColumnState[]
  events: ClusterExportEvent[]
}> {
  const [rows, coverage, accessible] = await Promise.all([
    getClusterRegistrationExportRows(session, clusterId),
    getClusterFormCoverage(session, clusterId),
    getAccessibleClusterEvents(session, clusterId),
  ])
  const events: ClusterExportEvent[] = accessible.map((e) => ({
    id: e.id,
    name: e.name,
  }))
  return { rows, columns: buildClusterExportColumns(coverage, rows, events), events }
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
    /**
     * PEOPLE on the roster with no registration belonging to this day at all —
     * they hold a standing series registration and nothing more. Excluded from
     * every figure above; surfaced so the roster's third state can be explained
     * rather than left to look like a rendering quirk.
     */
    seriesOnlyPeople: number
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
  // Every figure below describes the DAY. The roster carries the series-only
  // rows too, so each count filters rather than trusting the row set.
  const dayRows = rows.filter((r) => r.onClusterDay)

  const eventStats: ClusterEventStat[] = events.map((e) => {
    const eventRows = dayRows.filter((r) => r.eventId === e.id)
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
    dayRows
      .filter((r) => r.registrationClusterId === clusterId)
      .map((r) => personKeyFor(r))
  )

  const onDayPeople = roster.rows.filter((p) =>
    Object.values(p.perEvent).some((cell) => cell?.onClusterDay)
  )

  return {
    events,
    eventStats,
    roster,
    totals: {
      registrations: dayRows.length,
      uniquePeople: onDayPeople.length,
      checkedInPeople: roster.rows.filter((p) =>
        Object.values(p.perEvent).some((cell) => cell?.checkedIn)
      ).length,
      viaSharedLinkPeople: viaSharedLink.size,
      seriesOnlyPeople: roster.rows.length - onDayPeople.length,
    },
  }
}

// ─── Collab pools (CCF-148) ──────────────────────────────────────────────────
//
// A Collab cluster's staffing has two halves that work differently, and these
// helpers are where that shows:
//
//  - Volunteers are a UNION of the member events' rosters. The rows stay owned by
//    the event each person signed up under, so every row carries its event and the
//    table badges it.
//  - Breakout groups are OWNED by the cluster. There is nothing to union — the
//    member events' standing tables are deliberately not in play on the day.

export type ClusterVolunteerRow = Awaited<
  ReturnType<typeof getClusterVolunteerPool>
>["volunteers"][number]

/**
 * Every confirmed-or-pending volunteer across the day's member events, plus the
 * committees to filter by.
 *
 * Scoped to the events this user may see: a staff user with access to one
 * ministry's event sees that ministry's serving team and not the partner's, which
 * is the same narrowing `getAccessibleClusterEvents` applies everywhere else in
 * the cluster workspace.
 */
export async function getClusterVolunteerPool(
  session: Session | null,
  clusterId: string,
  filters?: { search?: string; status?: string; committeeId?: string }
) {
  const events = await getAccessibleClusterEvents(session, clusterId)
  const eventIds = events.map((e) => e.id)
  if (eventIds.length === 0) {
    return { volunteers: [], committees: [], events: [] }
  }

  const status = filters?.status
  const [volunteers, committees] = await Promise.all([
    db.volunteer.findMany({
      where: {
        eventId: { in: eventIds },
        AND: [
          status === "Pending" || status === "Confirmed" || status === "Rejected"
            ? { status }
            : {},
          filters?.committeeId ? { committeeId: filters.committeeId } : {},
          filters?.search
            ? {
                member:
                  allTokensMatch(filters.search, (token) => [
                    { firstName: { contains: token, mode: "insensitive" as const } },
                    { lastName: { contains: token, mode: "insensitive" as const } },
                  ]) ?? {},
              }
            : {},
        ],
      },
      orderBy: [{ eventId: "asc" }, { createdAt: "asc" }],
      include: {
        member: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        event: { select: { id: true, name: true } },
        committee: { select: { id: true, name: true } },
        preferredRole: { select: { id: true, name: true } },
        assignedRole: { select: { id: true, name: true } },
      },
    }),
    db.volunteerCommittee.findMany({
      where: { eventId: { in: eventIds } },
      orderBy: [{ eventId: "asc" }, { name: "asc" }],
      select: { id: true, name: true, eventId: true },
    }),
  ])

  return { volunteers, committees, events }
}

/**
 * The cluster's own breakout tables, the confirmed volunteers eligible to run
 * them, and how many of the day's people are still unseated.
 *
 * "Unseated" is counted in PEOPLE, not registrant rows. A Collab registers each
 * person to every member event, so counting rows would report a figure roughly N
 * times the number of people actually waiting for a table.
 */
export async function getClusterBreakoutPool(session: Session | null, clusterId: string) {
  const events = await getAccessibleClusterEvents(session, clusterId)
  const eventIds = events.map((e) => e.id)

  const owner = { clusterId }
  const [groups, volunteers, unseatedRows, registrantCount] = await Promise.all([
    db.breakoutGroup.findMany({ where: owner, ...breakoutGroupsInclude }),
    eventIds.length
      ? db.volunteer.findMany({
          where: { eventId: { in: eventIds }, status: "Confirmed" },
          orderBy: { createdAt: "asc" },
          include: {
            member: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                ledGroups: {
                  select: {
                    id: true,
                    name: true,
                    lifeStages: { select: { id: true } },
                    genderFocus: true,
                    language: true,
                    ageRangeMin: true,
                    ageRangeMax: true,
                    meetingFormat: true,
                    locationCity: true,
                    scheduleDayOfWeek: true,
                    scheduleTimeStart: true,
                    scheduleTimeEnd: true,
                  },
                },
              },
            },
            committee: { select: { id: true, name: true } },
            preferredRole: { select: { id: true, name: true } },
            assignedRole: { select: { id: true, name: true } },
          },
        })
      : [],
    eventIds.length
      ? db.eventRegistrant.findMany({
          where: { eventId: { in: eventIds }, ...unassignedCandidateWhere(owner) },
          select: { id: true, memberId: true, guestId: true },
        })
      : [],
    eventIds.length
      ? db.eventRegistrant.findMany({
          where: { eventId: { in: eventIds } },
          select: { id: true, memberId: true, guestId: true },
        })
      : [],
  ])

  const unseatedPeople = new Set(unseatedRows.map(personKeyFor)).size
  const totalPeople = new Set(registrantCount.map(personKeyFor)).size

  return { groups, volunteers, unseatedPeople, totalPeople, events }
}

/** The ministries represented by a cluster's member events, for the day's chips. */
export async function getClusterMinistries(
  clusterId: string
): Promise<{ id: string; name: string }[]> {
  const rows = await db.eventMinistry.findMany({
    where: { event: { clusterMembership: { clusterId } } },
    select: { ministry: { select: { id: true, name: true } } },
  })
  const byId = new Map(rows.map((r) => [r.ministry.id, r.ministry]))
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}
