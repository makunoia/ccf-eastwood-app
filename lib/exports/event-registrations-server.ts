import type { Session } from "next-auth"

import { db } from "@/lib/db"
import { getHouseholdLabels } from "@/lib/family-links"
import { PERSON_PROFILE_SELECT } from "@/lib/people/profile-select"
import { getEffectiveFormConfigs } from "@/lib/forms/context-config-server"
import {
  formatBirthDate,
  formatDietary,
  formatLanguages,
  formatMeetingPreference,
  formatSchedule,
  mergeFormConfigs,
} from "@/lib/forms/registration-responses"
import { canAccessEvent } from "@/lib/permissions"
import type { EventType } from "@/app/generated/prisma/client"
import {
  buildEventRegistrationColumns,
  type EventExportColumnState,
  type EventRegistrationExportRow,
} from "./event-registrations"

/**
 * Registration records for a single event's CSV export — **one row per
 * registration**.
 *
 * Unlike the cluster's export there is nothing to fold: `EventRegistrant` is
 * already one row per person per event series, so a person appears once. (A
 * duplicate sign-up on one event stays two rows on purpose — the admin needs to
 * see the duplicate in order to fix it, and silently merging them would hide it.)
 *
 * Every answer the registration form can gather is resolved here in the same
 * precedence the registrant detail page uses (per-event value → Member → Guest →
 * the registrant's own columns). Which of them an admin actually gets is decided
 * later, by the column picker.
 */
export async function getEventRegistrationExportRows(
  eventId: string
): Promise<EventRegistrationExportRow[]> {
  const registrants = await db.eventRegistrant.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
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
      breakoutGroupMemberships: {
        select: { breakoutGroup: { select: { name: true } } },
        orderBy: { assignedAt: "asc" },
      },
      occurrenceAttendances: {
        select: { occurrence: { select: { date: true } } },
        orderBy: { checkedInAt: "asc" },
      },
      baptismOptIn: { select: { id: true } },
      busPassengers: {
        select: { bus: { select: { name: true, direction: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  const households = await getHouseholdLabels(
    registrants.map((r) => ({ memberId: r.memberId, guestId: r.guestId }))
  )

  const rows = registrants.map((r): EventRegistrationExportRow => {
    const person = r.member ?? r.guest ?? null
    const memberSchedule = r.member?.schedulePreferences?.[0] ?? null
    const householdKey = r.memberId
      ? `member:${r.memberId}`
      : r.guestId
        ? `guest:${r.guestId}`
        : null

    // Occurrence dates are UTC midnight — slicing the ISO string is what keeps a
    // session dated "the 2nd" from reading as the 1st under a local timezone.
    const sessionDates = r.occurrenceAttendances
      .map((a) => a.occurrence.date.toISOString().split("T")[0])
      .sort()

    return {
      registrantId: r.id,
      firstName: r.member?.firstName ?? r.guest?.firstName ?? r.firstName ?? "",
      lastName: r.member?.lastName ?? r.guest?.lastName ?? r.lastName ?? "",
      email: person?.email ?? r.email ?? null,
      mobile: person?.phone ?? r.mobileNumber ?? "",
      type: r.memberId ? "Member" : "Guest",
      registeredAt: r.createdAt.toISOString(),
      attendedAt: r.attendedAt?.toISOString() ?? null,
      sessionsAttended: sessionDates.length,
      sessionDates: sessionDates.join("; ") || null,

      // The per-event nickname wins over the one on the profile — same
      // precedence the registrant list and check-in search use.
      nickname: r.nickname ?? person?.nickname ?? null,
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

      baptismOptIn: r.baptismOptIn !== null,
      bus: r.busPassengers.map((p) => p.bus.name).join("; ") || null,
      busDirection: r.busPassengers.map((p) => p.bus.direction).join("; ") || null,
    }
  })

  // Last name then first name, so the CSV and the registrants screen agree on
  // who comes first.
  return rows.sort((a, b) => {
    const lastCmp = a.lastName.localeCompare(b.lastName, undefined, { sensitivity: "base" })
    if (lastCmp !== 0) return lastCmp
    return a.firstName.localeCompare(b.firstName, undefined, { sensitivity: "base" })
  })
}

export type EventRegistrationExportPayload = {
  rows: EventRegistrationExportRow[]
  columns: EventExportColumnState[]
  eventType: EventType
}

/**
 * Export payload for the event registrants screen: rows + column offer + the
 * event's type, since the type decides the registration-record columns and the
 * client has to build the same registry the offer was computed from.
 *
 * The column offer unions the event's three form contexts (Register / Walk-in /
 * Check-in): we don't record which surface someone came through, so a field
 * counts as asked if any of them asks it.
 */
export async function getEventRegistrationExport(
  session: Session | null,
  eventId: string
): Promise<EventRegistrationExportPayload | null> {
  if (!canAccessEvent(session, eventId)) return null

  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { type: true, modules: { select: { type: true } } },
  })
  if (!event) return null

  const [rows, configs] = await Promise.all([
    getEventRegistrationExportRows(eventId),
    getEffectiveFormConfigs(eventId),
  ])
  const modules = event.modules.map((m) => m.type)

  return {
    rows,
    columns: buildEventRegistrationColumns(
      mergeFormConfigs(configs),
      modules,
      rows,
      event.type
    ),
    eventType: event.type,
  }
}
