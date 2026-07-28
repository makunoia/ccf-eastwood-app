"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import {
  eventPriceSchema,
  eventSchema,
  occurrenceFormSchema,
  occurrenceGroupingSchema,
  occurrenceSeriesSchema,
  registrationWindowSchema,
  type EventFormValues,
  type EventModuleSelection,
  type RegistrationWindowValues,
} from "@/lib/validations/event"
import { resolveModuleSelection } from "@/lib/events/modules"
import {
  autoCheckinIfOpenRecurringSession,
  checkInWalkInRegistrant,
  completeEventRegistration,
  findEventVolunteerConflict,
  findExistingEventRegistration,
  resolveAnonymousGuest,
  resolveConfirmedGuest,
  resolveConfirmedMember,
  type AssignedBreakout,
} from "@/lib/events/registration-core"
import { registrantSchema } from "@/lib/validations/event-registrant"
import {
  findMatchingSeries,
  normalizeUtcDate,
  rangesOverlap,
  seriesContainsDate,
} from "@/lib/events/occurrence-series"
import { isWithinRegistrationWindow } from "@/lib/events/registration-window"
import { getEffectiveFormConfig } from "@/lib/forms/context-config-server"
import {
  resolveBreakoutSelection,
  sanitizeHouseholdMember,
  sanitizeRegistrantPayload,
} from "@/lib/forms/registration-payload"
import { findFamilyBySpouse, type FamilyPersonRef } from "@/lib/family-links"
import {
  deriveFamilyName,
  householdMemberSchema,
  householdSchema,
} from "@/lib/validations/household"
import { formatPhilippinePhone } from "@/lib/utils"
import type { Gender } from "@/app/generated/prisma/client"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

async function requireWrite(): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canWrite(session, "Events")) return { error: "Unauthorized." }
  return null
}

type OccurrenceSeriesRecord = {
  id: string
  title: string
  startDate: Date
  endDate: Date
}

async function requireRecurringEvent(
  eventId: string
): Promise<ActionResult<{ id: string }> | { success: true; data: { id: string } }> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, type: true },
  })

  if (!event || event.type !== "Recurring") {
    return { success: false, error: "Recurring event not found" }
  }

  return { success: true, data: { id: event.id } }
}

async function getEventSeries(eventId: string): Promise<OccurrenceSeriesRecord[]> {
  return db.eventOccurrenceSeries.findMany({
    where: { eventId },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
    },
  })
}

function findOverlappingSeries(
  candidate: Pick<OccurrenceSeriesRecord, "startDate" | "endDate">,
  series: OccurrenceSeriesRecord[],
  excludeId?: string,
) {
  return (
    series.find(
      (entry) =>
        entry.id !== excludeId &&
        rangesOverlap(candidate, {
          startDate: entry.startDate,
          endDate: entry.endDate,
        }),
    ) ?? null
  )
}

function revalidateRecurringEventPaths(eventId: string, occurrenceId?: string) {
  revalidatePath(`/event/${eventId}/sessions`)
  revalidatePath(`/event/${eventId}/dashboard`)
  revalidatePath(`/events/${eventId}/checkin`)
  if (occurrenceId) {
    revalidatePath(`/events/${eventId}/checkin/${occurrenceId}`)
    revalidatePath(`/event/${eventId}/sessions/${occurrenceId}`)
  }
}

/**
 * Create an event, including the modules it starts with (CCF-131).
 *
 * Modules are decided here rather than left for the admin to discover in Settings:
 * everything downstream — which nav items exist, which setup steps are worth
 * showing, what the registration form collects — follows from this choice, so the
 * event is created already knowing what it is. Picking none is a valid answer.
 *
 * `price` is only read when the selection resolves to include Priced, keeping the
 * module row and the stored price a single fact rather than two that can drift.
 */
export async function createEvent(
  raw: EventFormValues,
  moduleSelection?: EventModuleSelection
): Promise<ActionResult<{ id: string }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = eventSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  const modules = resolveModuleSelection(
    moduleSelection?.types ?? [],
    parsed.data.type
  )

  let price: number | null = null
  if (modules.includes("Priced")) {
    const parsedPrice = eventPriceSchema.safeParse({
      price: moduleSelection?.price ?? "",
    })
    if (!parsedPrice.success) {
      return {
        success: false,
        error: parsedPrice.error.issues[0]?.message ?? "Invalid price",
      }
    }
    price = parsedPrice.data.price
  }

  try {
    const event = await db.event.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        type: parsed.data.type,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate ?? parsed.data.startDate,
        price,
        recurrenceDayOfWeek: parsed.data.type === "Recurring" ? parsed.data.recurrenceDayOfWeek : null,
        recurrenceFrequency: parsed.data.type === "Recurring" ? (parsed.data.recurrenceFrequency ?? null) : null,
        recurrenceEndDate: parsed.data.type === "Recurring" ? (parsed.data.recurrenceEndDate ?? null) : null,
        allMinistries: parsed.data.allMinistries,
        // A church-wide event links no ministries — the flag is the statement, and
        // it keeps covering ministries created after the event.
        ministries:
          !parsed.data.allMinistries && parsed.data.ministryIds?.length
            ? { create: parsed.data.ministryIds.map((ministryId) => ({ ministryId })) }
            : undefined,
        modules: modules.length
          ? { create: modules.map((type) => ({ type })) }
          : undefined,
      },
      select: { id: true },
    })
    revalidatePath("/events")
    return { success: true, data: { id: event.id } }
  } catch {
    return { success: false, error: "Failed to create event" }
  }
}

export async function updateEvent(
  id: string,
  raw: EventFormValues
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = eventSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  try {
    const existing = await db.event.findUnique({
      where: { id },
      select: { type: true },
    })
    if (!existing) return { success: false, error: "Event not found" }

    // Event type is immutable after creation — ignore any submitted change
    // and key all type-dependent fields off the stored type.
    const type = existing.type
    const isRecurring = type === "Recurring"

    await db.$transaction([
      db.eventMinistry.deleteMany({ where: { eventId: id } }),
      db.event.update({
        where: { id },
        data: {
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          startDate: parsed.data.startDate,
          endDate: parsed.data.endDate ?? parsed.data.startDate,
          recurrenceDayOfWeek: isRecurring ? parsed.data.recurrenceDayOfWeek : null,
          recurrenceFrequency: isRecurring ? (parsed.data.recurrenceFrequency ?? null) : null,
          recurrenceEndDate: isRecurring ? (parsed.data.recurrenceEndDate ?? null) : null,
          allMinistries: parsed.data.allMinistries,
          ministries:
            !parsed.data.allMinistries && parsed.data.ministryIds?.length
              ? { create: parsed.data.ministryIds.map((ministryId) => ({ ministryId })) }
              : undefined,
        },
      }),
    ])
    revalidatePath("/events")
    revalidatePath(`/events/${id}`)
    revalidatePath(`/event/${id}`, "layout")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update event" }
  }
}

/**
 * The public registration window, configured on Forms → Registration Form beside
 * the open/closed switch. Split out of `updateEvent` so saving unrelated event
 * details can't disturb it.
 *
 * Recurring events have no window — first-timers register once and returning
 * attendees check in per occurrence.
 */
export async function updateRegistrationWindow(
  id: string,
  raw: RegistrationWindowValues
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = registrationWindowSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  try {
    const existing = await db.event.findUnique({
      where: { id },
      select: { type: true },
    })
    if (!existing) return { success: false, error: "Event not found" }
    if (existing.type === "Recurring") {
      return {
        success: false,
        error: "Recurring events don't use a registration window.",
      }
    }

    await db.event.update({
      where: { id },
      data: {
        registrationStart: parsed.data.registrationStart,
        registrationEnd: parsed.data.registrationEnd,
      },
    })

    revalidatePath("/events")
    revalidatePath(`/event/${id}/forms/EventRegistration`)
    revalidatePath(`/events/${id}/register`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update the registration window" }
  }
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    await db.event.delete({ where: { id } })
    revalidatePath("/events")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete event" }
  }
}

/**
 * Permanently hides the dashboard setup walkthrough for an event. Once dismissed
 * the checklist never reappears (even if data is later deleted).
 */
export async function dismissEventSetup(eventId: string): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    await db.event.update({
      where: { id: eventId },
      data: { setupDismissedAt: new Date() },
    })
    revalidatePath(`/event/${eventId}/dashboard`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to dismiss setup checklist" }
  }
}

type MemberLookupResult = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  matchedBy: "mobile" | "email" | "nameBirthday"
  recordType: "member" | "guest"
  isVolunteer: boolean
  // Member-only fields (only present when recordType === "member")
  smallGroupId?: string | null
  groupStatus?: string | null
  lifeStageId?: string | null
  language?: string[]
  meetingPreference?: string | null
  workCity?: string | null
  schedulePreferences?: { dayOfWeek: number; timeStart: string }[]
}

type AmbiguousLookupCandidate = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  recordType: "member" | "guest"
  isVolunteer: boolean
  // Member-only fields
  smallGroupId?: string | null
  groupStatus?: string | null
  lifeStageId?: string | null
  language?: string[]
  meetingPreference?: string | null
  workCity?: string | null
  schedulePreferences?: { dayOfWeek: number; timeStart: string }[]
}

type AmbiguousLookupResult = {
  matchType: "ambiguous"
  matchedBy: "mobile" | "email"
  candidates: AmbiguousLookupCandidate[]
}

// Returns matched member/guest info if found, null otherwise.
// Used by the public registration form for member/guest resolution.
// Priority (Members first, then Guests): mobile number → email → last name + birthday
export async function lookupMemberForRegistration(params: {
  mobileNumber?: string | null
  email?: string | null
  lastName?: string | null
  birthMonth?: number | null
  birthYear?: number | null
  eventId?: string | null
}): Promise<MemberLookupResult | AmbiguousLookupResult | null> {
  const memberSelect = {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    phone: true,
    smallGroupId: true,
    groupStatus: true,
    lifeStageId: true,
    language: true,
    meetingPreference: true,
    workCity: true,
    schedulePreferences: {
      select: { dayOfWeek: true, timeStart: true, timeEnd: true },
      orderBy: { createdAt: "asc" as const },
      take: 1,
    },
  }
  const guestSelect = { id: true, firstName: true, lastName: true, email: true, phone: true }

  // Normalize to the canonical stored format so lookups match how numbers are persisted.
  const normalizedMobile = params.mobileNumber ? formatPhilippinePhone(params.mobileNumber.trim()) : null

  if (normalizedMobile) {
    const members = await db.member.findMany({
      where: { phone: normalizedMobile },
      select: memberSelect,
    })
    if (members.length > 1) {
      const volunteerMemberIds = params.eventId
        ? new Set(
            (await db.volunteer.findMany({
              where: { eventId: params.eventId, memberId: { in: members.map((m) => m.id) } },
              select: { memberId: true },
            })).map((v) => v.memberId)
          )
        : new Set<string>()
      return {
        matchType: "ambiguous",
        matchedBy: "mobile",
        candidates: members.map((m) => ({ ...m, recordType: "member" as const, isVolunteer: volunteerMemberIds.has(m.id) })),
      }
    }
    if (members.length === 1) {
      const isVolunteer = params.eventId
        ? !!(await db.volunteer.findFirst({ where: { memberId: members[0].id, eventId: params.eventId }, select: { id: true } }))
        : false
      return { ...members[0], matchedBy: "mobile", recordType: "member", isVolunteer }
    }
  }

  if (params.email) {
    const members = await db.member.findMany({
      where: { email: params.email.trim() },
      select: memberSelect,
    })
    if (members.length > 1) {
      const volunteerMemberIds = params.eventId
        ? new Set(
            (await db.volunteer.findMany({
              where: { eventId: params.eventId, memberId: { in: members.map((m) => m.id) } },
              select: { memberId: true },
            })).map((v) => v.memberId)
          )
        : new Set<string>()
      return {
        matchType: "ambiguous",
        matchedBy: "email",
        candidates: members.map((m) => ({ ...m, recordType: "member" as const, isVolunteer: volunteerMemberIds.has(m.id) })),
      }
    }
    if (members.length === 1) {
      const isVolunteer = params.eventId
        ? !!(await db.volunteer.findFirst({ where: { memberId: members[0].id, eventId: params.eventId }, select: { id: true } }))
        : false
      return { ...members[0], matchedBy: "email", recordType: "member", isVolunteer }
    }
  }

  if (params.lastName && params.birthMonth != null && params.birthYear != null) {
    const member = await db.member.findFirst({
      where: {
        lastName: { equals: params.lastName.trim(), mode: "insensitive" },
        birthMonth: params.birthMonth,
        birthYear: params.birthYear,
      },
      select: memberSelect,
    })
    if (member) {
      const isVolunteer = params.eventId
        ? !!(await db.volunteer.findFirst({ where: { memberId: member.id, eventId: params.eventId }, select: { id: true } }))
        : false
      return { ...member, matchedBy: "nameBirthday", recordType: "member", isVolunteer }
    }
  }

  // No Member found — fall back to Guest records (only active guests, not yet promoted to members)
  if (normalizedMobile) {
    const guests = await db.guest.findMany({
      where: { phone: normalizedMobile, memberId: null },
      select: guestSelect,
    })
    if (guests.length > 1) {
      return {
        matchType: "ambiguous",
        matchedBy: "mobile",
        candidates: guests.map((g) => ({ ...g, recordType: "guest" as const, isVolunteer: false })),
      }
    }
    if (guests.length === 1) return { ...guests[0], matchedBy: "mobile", recordType: "guest", isVolunteer: false }
  }

  if (params.email) {
    const guests = await db.guest.findMany({
      where: { email: params.email.trim(), memberId: null },
      select: guestSelect,
    })
    if (guests.length > 1) {
      return {
        matchType: "ambiguous",
        matchedBy: "email",
        candidates: guests.map((g) => ({ ...g, recordType: "guest" as const, isVolunteer: false })),
      }
    }
    if (guests.length === 1) return { ...guests[0], matchedBy: "email", recordType: "guest", isVolunteer: false }
  }

  if (params.lastName && params.birthMonth != null && params.birthYear != null) {
    const guest = await db.guest.findFirst({
      where: {
        lastName: { equals: params.lastName.trim(), mode: "insensitive" },
        birthMonth: params.birthMonth,
        birthYear: params.birthYear,
        memberId: null,
      },
      select: guestSelect,
    })
    if (guest) return { ...guest, matchedBy: "nameBirthday", recordType: "guest", isVolunteer: false }
  }

  return null
}

// Kept for backward compatibility — delegates to lookupMemberForRegistration
export async function lookupMemberByMobile(
  mobileNumber: string
): Promise<{ id: string; firstName: string; lastName: string; email: string | null; phone: string | null } | null> {
  const result = await lookupMemberForRegistration({ mobileNumber })
  if (!result) return null
  if ("matchType" in result) return null
  const { matchedBy: _, ...member } = result
  return member
}

export async function createRegistrant(
  eventId: string,
  raw: z.input<typeof registrantSchema>,
  confirmedMemberId: string | null,
  confirmedGuestId?: string | null,
  skipDeduplication?: boolean,
  selectedBreakoutGroupId?: string | null,
  // Walk-in mode (check-in kiosk): reuse an existing registration instead of
  // erroring, and check the person in immediately after registering.
  walkIn?: { occurrenceId: string | null }
): Promise<ActionResult<{ id: string; breakoutGroup: AssignedBreakout }>> {
  const parsed = registrantSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    // Enforce the event's Opens/Closes window server-side. Walk-ins are exempt:
    // they're staff-supervised at the door and must go through even after close.
    if (!walkIn) {
      const event = await db.event.findUnique({
        where: { id: eventId },
        select: { registrationStart: true, registrationEnd: true },
      })
      if (!event) {
        return { success: false, error: "Event not found." }
      }
      if (!isWithinRegistrationWindow(event.registrationStart, event.registrationEnd)) {
        return { success: false, error: "Registration for this event is closed." }
      }
    }

    // Enforce the form config server-side. The public form already withholds
    // disabled fields, so this changes nothing for real traffic — it stops a
    // crafted POST from storing a field the admin turned off. Mutating the parsed
    // payload in place (rather than threading a second variable through every
    // branch below) keeps one source of truth: there is no path that can read the
    // unsanitised value by accident.
    const formConfig = await getEffectiveFormConfig(eventId, walkIn ? "WalkIn" : "Register")
    Object.assign(parsed.data, sanitizeRegistrantPayload(formConfig, parsed.data))
    // A submitted breakout pick counts only where the picker is offered. Auto-assign
    // runs off a null selection, so it is unaffected.
    const breakoutPick = resolveBreakoutSelection(formConfig, selectedBreakoutGroupId)

    // The steps below (person resolution → per-event completion) live in
    // lib/events/registration-core.ts so the cluster shared form (CCF-132) can
    // resolve the person once and fan out across events. The order here is the
    // same as before the extraction: guards fire before any profile write.
    if (confirmedMemberId) {
      // Volunteer guard — volunteers don't need to register as attendees
      if (await findEventVolunteerConflict(eventId, confirmedMemberId)) {
        return { success: false, error: "You're serving as a volunteer at this event — you don't need to register as an attendee." }
      }

      // Duplicate check — member already registered for this event.
      // Walk-in mode reuses the existing registration (the person may have
      // registered under a different contact identifier than they looked up with).
      const existingRegistrationId = await findExistingEventRegistration(eventId, {
        memberId: confirmedMemberId,
      })
      if (existingRegistrationId && !walkIn) {
        return { success: false, error: "You're already registered for this event." }
      }

      const stored = await resolveConfirmedMember(confirmedMemberId, parsed.data)
      const result = await completeEventRegistration({
        eventId,
        person: { memberId: confirmedMemberId },
        data: parsed.data,
        breakoutPick,
        profile: {
          gender: (parsed.data.gender ?? stored.gender) as Gender | null,
          birthYear: parsed.data.birthYear ?? stored.birthYear,
        },
        walkIn,
        existingRegistrantId: existingRegistrationId,
      })
      return { success: true, data: result }
    } else if (confirmedGuestId) {
      // Duplicate check — guest already registered for this event (walk-in reuses it)
      const existingRegistrationId = await findExistingEventRegistration(eventId, {
        guestId: confirmedGuestId,
      })
      if (existingRegistrationId && !walkIn) {
        return { success: false, error: "You're already registered for this event." }
      }

      const stored = await resolveConfirmedGuest(confirmedGuestId, parsed.data)
      const result = await completeEventRegistration({
        eventId,
        person: { guestId: confirmedGuestId },
        data: parsed.data,
        breakoutPick,
        profile: {
          gender: (parsed.data.gender ?? stored.gender) as Gender | null,
          birthYear: parsed.data.birthYear ?? stored.birthYear,
        },
        walkIn,
        existingRegistrantId: existingRegistrationId,
      })
      return { success: true, data: result }
    } else {
      // Non-member — find or create Guest (dedup ladder: phone → email →
      // last name + birthday), then link via guestId
      const { guestId } = await resolveAnonymousGuest(parsed.data, skipDeduplication)

      // Duplicate check — guest already registered for this event (walk-in reuses it)
      const existingRegistrationId = await findExistingEventRegistration(eventId, { guestId })
      if (existingRegistrationId && !walkIn) {
        return { success: false, error: "You're already registered for this event." }
      }

      const result = await completeEventRegistration({
        eventId,
        person: { guestId, nickname: parsed.data.nickname ?? null },
        data: parsed.data,
        breakoutPick,
        profile: {
          gender: (parsed.data.gender ?? null) as Gender | null,
          birthYear: parsed.data.birthYear ?? null,
        },
        walkIn,
        existingRegistrantId: existingRegistrationId,
      })
      return { success: true, data: result }
    }
  } catch {
    return { success: false, error: "Failed to register. Please try again." }
  }
}

export async function markCheckinAttendance(
  subject: CheckinSubject
): Promise<ActionResult> {
  try {
    if (subject.kind === "volunteer") {
      await db.volunteer.update({
        where: { id: subject.id },
        data: { attendedAt: new Date() },
      })
    } else {
      await db.eventRegistrant.update({
        where: { id: subject.id },
        data: { attendedAt: new Date() },
      })
    }
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to mark attendance" }
  }
}

export async function markRegistrantPaid(
  registrantId: string,
  paymentReference: string,
  eventId: string
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (!paymentReference.trim()) {
    return { success: false, error: "Payment reference is required" }
  }
  try {
    await db.eventRegistrant.update({
      where: { id: registrantId },
      data: { isPaid: true, paymentReference: paymentReference.trim() },
    })
    revalidatePath(`/events/${eventId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to mark as paid" }
  }
}

export async function markRegistrantAttended(
  registrantId: string,
  eventId: string
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    await db.eventRegistrant.update({
      where: { id: registrantId },
      data: { attendedAt: new Date() },
    })
    revalidatePath(`/events/${eventId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to mark attendance" }
  }
}

export async function unmarkRegistrantAttended(
  registrantId: string,
  eventId: string
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    await db.eventRegistrant.update({
      where: { id: registrantId },
      data: { attendedAt: null },
    })
    revalidatePath(`/events/${eventId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to unmark attendance" }
  }
}

export async function createOccurrence(
  eventId: string,
  raw: string | z.input<typeof occurrenceFormSchema>
): Promise<ActionResult<{ id: string }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = occurrenceFormSchema.safeParse(
    typeof raw === "string"
      ? { date: raw, isStandalone: false, seriesId: null }
      : raw,
  )
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  try {
    const recurringEvent = await requireRecurringEvent(eventId)
    if (!recurringEvent.success) return recurringEvent

    const dateValue = normalizeUtcDate(parsed.data.date)
    const existing = await db.eventOccurrence.findUnique({
      where: { eventId_date: { eventId, date: dateValue } },
      select: { id: true },
    })
    if (existing) {
      return { success: false, error: "A session already exists for this date" }
    }

    const allSeries = await getEventSeries(eventId)
    let seriesId: string | null = null

    if (!parsed.data.isStandalone) {
      if (parsed.data.seriesId) {
        const selectedSeries = allSeries.find((series) => series.id === parsed.data.seriesId)
        if (!selectedSeries) {
          return { success: false, error: "Series not found" }
        }
        if (!seriesContainsDate(selectedSeries, dateValue)) {
          return {
            success: false,
            error: "Selected series does not include this session date",
          }
        }
        seriesId = selectedSeries.id
      } else {
        seriesId = findMatchingSeries(allSeries, dateValue)?.id ?? null
      }
    }

    const occurrence = await db.eventOccurrence.create({
      data: {
        eventId,
        date: dateValue,
        isStandalone: parsed.data.isStandalone,
        seriesId,
      },
      select: { id: true },
    })
    revalidateRecurringEventPaths(eventId, occurrence.id)
    return { success: true, data: { id: occurrence.id } }
  } catch {
    return { success: false, error: "Failed to create session" }
  }
}

export async function createOccurrenceSeries(
  eventId: string,
  raw: z.input<typeof occurrenceSeriesSchema>,
): Promise<ActionResult<{ id: string }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = occurrenceSeriesSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  try {
    const recurringEvent = await requireRecurringEvent(eventId)
    if (!recurringEvent.success) return recurringEvent

    const startDate = normalizeUtcDate(parsed.data.startDate)
    const endDate = normalizeUtcDate(parsed.data.endDate)
    const allSeries = await getEventSeries(eventId)
    const overlap = findOverlappingSeries({ startDate, endDate }, allSeries)

    if (overlap) {
      return {
        success: false,
        error: `Series overlaps with "${overlap.title}"`,
      }
    }

    const createdSeries = await db.$transaction(async (tx) => {
      const created = await tx.eventOccurrenceSeries.create({
        data: {
          eventId,
          title: parsed.data.title.trim(),
          startDate,
          endDate,
        },
        select: { id: true },
      })

      await tx.eventOccurrence.updateMany({
        where: {
          eventId,
          isStandalone: false,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        data: { seriesId: created.id },
      })

      return created
    })

    revalidateRecurringEventPaths(eventId)
    return { success: true, data: { id: createdSeries.id } }
  } catch {
    return { success: false, error: "Failed to create series" }
  }
}

export async function updateOccurrenceSeries(
  seriesId: string,
  eventId: string,
  raw: z.input<typeof occurrenceSeriesSchema>,
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = occurrenceSeriesSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  try {
    const series = await db.eventOccurrenceSeries.findUnique({
      where: { id: seriesId },
      select: {
        id: true,
        eventId: true,
        event: { select: { type: true } },
      },
    })

    if (!series || series.eventId !== eventId || series.event.type !== "Recurring") {
      return { success: false, error: "Series not found" }
    }

    const startDate = normalizeUtcDate(parsed.data.startDate)
    const endDate = normalizeUtcDate(parsed.data.endDate)
    const allSeries = await getEventSeries(eventId)
    const overlap = findOverlappingSeries({ startDate, endDate }, allSeries, seriesId)

    if (overlap) {
      return {
        success: false,
        error: `Series overlaps with "${overlap.title}"`,
      }
    }

    await db.$transaction(async (tx) => {
      await tx.eventOccurrenceSeries.update({
        where: { id: seriesId },
        data: {
          title: parsed.data.title.trim(),
          startDate,
          endDate,
        },
      })

      await tx.eventOccurrence.updateMany({
        where: {
          eventId,
          seriesId,
          OR: [
            { date: { lt: startDate } },
            { date: { gt: endDate } },
            { isStandalone: true },
          ],
        },
        data: { seriesId: null },
      })

      await tx.eventOccurrence.updateMany({
        where: {
          eventId,
          isStandalone: false,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        data: { seriesId },
      })
    })

    revalidateRecurringEventPaths(eventId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update series" }
  }
}

export async function deleteOccurrenceSeries(
  seriesId: string,
  eventId: string,
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const series = await db.eventOccurrenceSeries.findUnique({
      where: { id: seriesId },
      select: {
        id: true,
        eventId: true,
        event: { select: { type: true } },
      },
    })

    if (!series || series.eventId !== eventId || series.event.type !== "Recurring") {
      return { success: false, error: "Series not found" }
    }

    await db.eventOccurrenceSeries.delete({
      where: { id: seriesId },
    })

    revalidateRecurringEventPaths(eventId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete series" }
  }
}

export async function updateOccurrenceGrouping(
  occurrenceId: string,
  eventId: string,
  raw: z.input<typeof occurrenceGroupingSchema>,
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = occurrenceGroupingSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  try {
    const occurrence = await db.eventOccurrence.findUnique({
      where: { id: occurrenceId },
      select: {
        id: true,
        eventId: true,
        date: true,
        event: {
          select: {
            type: true,
          },
        },
      },
    })

    if (!occurrence || occurrence.eventId !== eventId || occurrence.event.type !== "Recurring") {
      return { success: false, error: "Session not found" }
    }

    if (parsed.data.isStandalone) {
      await db.eventOccurrence.update({
        where: { id: occurrenceId },
        data: {
          isStandalone: true,
          seriesId: null,
        },
      })
      revalidateRecurringEventPaths(eventId, occurrenceId)
      return { success: true, data: undefined }
    }

    const allSeries = await getEventSeries(eventId)
    let nextSeriesId: string | null = null

    if (parsed.data.seriesId) {
      const selectedSeries = allSeries.find((series) => series.id === parsed.data.seriesId)
      if (!selectedSeries) {
        return { success: false, error: "Series not found" }
      }

      if (!seriesContainsDate(selectedSeries, occurrence.date)) {
        return {
          success: false,
          error: "Selected series does not include this session date",
        }
      }

      nextSeriesId = selectedSeries.id
    } else {
      nextSeriesId = findMatchingSeries(allSeries, occurrence.date)?.id ?? null
    }

    await db.eventOccurrence.update({
      where: { id: occurrenceId },
      data: {
        isStandalone: false,
        seriesId: nextSeriesId,
      },
    })

    revalidateRecurringEventPaths(eventId, occurrenceId)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update session" }
  }
}

export async function deleteOccurrence(
  occurrenceId: string,
  eventId: string
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const occurrence = await db.eventOccurrence.findUnique({
      where: { id: occurrenceId },
      select: {
        eventId: true,
        event: { select: { type: true } },
      },
    })

    if (!occurrence || occurrence.eventId !== eventId) {
      return { success: false, error: "Session not found" }
    }

    if (occurrence.event.type !== "Recurring") {
      return { success: false, error: "Only recurring sessions can be deleted" }
    }

     await db.eventOccurrence.delete({ where: { id: occurrenceId } })
    revalidateRecurringEventPaths(eventId, occurrenceId)
    revalidatePath(`/event/${eventId}/breakouts`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete session" }
  }
}

export async function ensureMultiDayOccurrences(
  eventId: string,
  startDate: Date,
  endDate: Date,
): Promise<ActionResult<{ id: string; date: Date }[]>> {
  try {
    const dates: Date[] = []
    const current = new Date(startDate)
    current.setUTCHours(0, 0, 0, 0)
    const end = new Date(endDate)
    end.setUTCHours(0, 0, 0, 0)
    while (current <= end) {
      dates.push(new Date(current))
      current.setUTCDate(current.getUTCDate() + 1)
    }

    await Promise.all(
      dates.map((date) =>
        db.eventOccurrence.upsert({
          where: { eventId_date: { eventId, date } },
          create: { eventId, date },
          update: {},
        })
      )
    )

    const occurrences = await db.eventOccurrence.findMany({
      where: { eventId, date: { gte: dates[0], lte: dates[dates.length - 1] } },
      orderBy: { date: "asc" },
      include: { _count: { select: { attendees: true } } },
    })

    return { success: true, data: occurrences }
  } catch {
    return { success: false, error: "Failed to ensure daily occurrences" }
  }
}

export async function checkInToOccurrence(
  occurrenceId: string,
  subject: CheckinSubject
): Promise<ActionResult> {
  try {
    if (subject.kind === "volunteer") {
      await db.occurrenceAttendee.upsert({
        where: { occurrenceId_volunteerId: { occurrenceId, volunteerId: subject.id } },
        create: { occurrenceId, volunteerId: subject.id },
        update: {},
      })
    } else {
      await db.occurrenceAttendee.upsert({
        where: { occurrenceId_registrantId: { occurrenceId, registrantId: subject.id } },
        create: { occurrenceId, registrantId: subject.id },
        update: {},
      })
    }
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to check in" }
  }
}

export async function setOccurrenceCheckinOpen(
  occurrenceId: string,
  isOpen: boolean,
  eventId: string
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    await db.eventOccurrence.update({
      where: { id: occurrenceId },
      data: { isOpen },
    })
    revalidatePath(`/event/${eventId}/sessions`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update session" }
  }
}

type GuestSmallGroupPrompt = {
  guestId: string
  existingProfile: {
    lifeStageId: string | null
    gender: "Male" | "Female" | null
    language: string[]
    meetingPreference: "Online" | "Hybrid" | "InPerson" | null
    workCity: string | null
    scheduleDayOfWeek: number | null
    scheduleTimeStart: string | null
    scheduleTimeEnd: string | null
    ageRangeBucketId: string | null
  }
}

// A check-in subject is either an event registrant or an event volunteer — never both.
// Volunteers are looked up via their linked Member and recorded with the same attendance
// machinery (OccurrenceAttendee for sessions, attendedAt for OneTime).
export type CheckinSubjectKind = "registrant" | "volunteer"
export type CheckinSubject = { kind: CheckinSubjectKind; id: string }

type CheckinRegistrantResult = {
  kind: CheckinSubjectKind
  subjectId: string
  name: string
  nickname: string | null
  alreadyCheckedIn: boolean
  // Masked phone/email so same-name candidates on the disambiguation screen can
  // be told apart without exposing full contact details on a public page.
  contactHint: string | null
  // Set when this is a guest's 2nd+ occurrence check-in and their profile is incomplete.
  // Always null for volunteers.
  guestSmallGroupPrompt: GuestSmallGroupPrompt | null
}

type CheckinAmbiguousResult = {
  matchType: "ambiguous"
  candidates: CheckinRegistrantResult[]
}

// ── Shared check-in lookup machinery ──────────────────────────────────────────
// All public lookup modes (mobile/email, full name, last name + birthday) load
// the same registrant/volunteer rows and resolve candidates identically — only
// the filter differs.

function findEventRegistrantsForLookup(eventId: string) {
  return db.eventRegistrant.findMany({
    where: { eventId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      email: true,
      mobileNumber: true,
      attendedAt: true,
      guestId: true,
      memberId: true,
      member: {
        select: {
          firstName: true,
          lastName: true,
          nickname: true,
          email: true,
          phone: true,
          birthMonth: true,
          birthYear: true,
        },
      },
      guest: {
        select: {
          firstName: true,
          lastName: true,
          nickname: true,
          email: true,
          phone: true,
          birthMonth: true,
          birthYear: true,
          lifeStageId: true,
          gender: true,
          language: true,
          meetingPreference: true,
          workCity: true,
          scheduleDayOfWeek: true,
          scheduleTimeStart: true,
          scheduleTimeEnd: true,
          ageRangeBucketId: true,
          claimedSmallGroupId: true,
          groupRequests: { select: { status: true } },
        },
      },
    },
  })
}

type RegistrantLookupRow = Awaited<ReturnType<typeof findEventRegistrantsForLookup>>[number]

function normalizeNameInput(v: string): string {
  return v.trim().replace(/\s+/g, " ").toLowerCase()
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  return `+63 ••• ••• ${digits.slice(-4)}`
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!domain) return "•••"
  return `${local.slice(0, 1)}•••@${domain}`
}

function contactHintFrom(phone: string | null, email: string | null): string | null {
  if (phone) return maskPhone(phone)
  if (email) return maskEmail(email)
  return null
}

async function resolveRegistrantCandidate(
  matched: RegistrantLookupRow,
  occurrenceId: string | null
): Promise<CheckinRegistrantResult> {
  const firstName = matched.member?.firstName ?? matched.guest?.firstName ?? matched.firstName ?? ""
  const lastName = matched.member?.lastName ?? matched.guest?.lastName ?? matched.lastName ?? ""
  const name = `${firstName} ${lastName}`.trim()

  let alreadyCheckedIn: boolean
  if (occurrenceId !== null) {
    const existing = await db.occurrenceAttendee.findUnique({
      where: { occurrenceId_registrantId: { occurrenceId, registrantId: matched.id } },
      select: { id: true },
    })
    alreadyCheckedIn = existing !== null
  } else {
    alreadyCheckedIn = matched.attendedAt !== null
  }

  let guestSmallGroupPrompt: GuestSmallGroupPrompt | null = null
  if (matched.guestId && matched.guest) {
    const g = matched.guest
    const noClaimedGroup = !g.claimedSmallGroupId
    const hasPendingRequest = g.groupRequests.some(
      (r) => r.status === "Pending" || r.status === "Confirmed"
    )
    if (noClaimedGroup && !hasPendingRequest) {
      guestSmallGroupPrompt = {
        guestId: matched.guestId,
        existingProfile: {
          lifeStageId: g.lifeStageId,
          gender: g.gender,
          language: g.language,
          meetingPreference: g.meetingPreference,
          workCity: g.workCity,
          scheduleDayOfWeek: g.scheduleDayOfWeek,
          scheduleTimeStart: g.scheduleTimeStart,
          scheduleTimeEnd: g.scheduleTimeEnd,
          ageRangeBucketId: g.ageRangeBucketId,
        },
      }
    }
  }

  return {
    kind: "registrant" as const,
    subjectId: matched.id,
    name,
    // The per-event nickname wins; otherwise fall back to the one on the profile.
    nickname: matched.nickname ?? matched.member?.nickname ?? matched.guest?.nickname ?? null,
    alreadyCheckedIn,
    contactHint: contactHintFrom(
      matched.member?.phone ?? matched.guest?.phone ?? matched.mobileNumber,
      matched.member?.email ?? matched.guest?.email ?? matched.email
    ),
    guestSmallGroupPrompt,
  }
}

// One person can own several rows for the same event — two registrations from a
// duplicate sign-up, or a volunteer who also registered. Keying on the underlying
// Member/Guest collapses those into a single check-in subject; rows with no linked
// profile fall back to name + contact.
function registrantIdentityKey(r: RegistrantLookupRow): string {
  if (r.memberId) return `member:${r.memberId}`
  if (r.guestId) return `guest:${r.guestId}`
  const name = normalizeNameInput(`${r.firstName ?? ""} ${r.lastName ?? ""}`)
  const contact = (r.mobileNumber ?? r.email ?? "").toLowerCase().replace(/\s+/g, "")
  return `anon:${name}|${contact}`
}

// Keeps one candidate per identity, preferring a record that is already checked in
// so the board never offers to check in someone it just recorded.
function dedupeCheckinCandidates(
  entries: { key: string; candidate: CheckinRegistrantResult }[]
): CheckinRegistrantResult[] {
  const byKey = new Map<string, CheckinRegistrantResult>()
  for (const { key, candidate } of entries) {
    const existing = byKey.get(key)
    if (!existing || (!existing.alreadyCheckedIn && candidate.alreadyCheckedIn)) {
      byKey.set(key, candidate)
    }
  }
  return [...byKey.values()]
}

async function resolveCheckinCandidates(
  matchedRegistrants: RegistrantLookupRow[],
  matchedVolunteers: VolunteerLookupRow[],
  occurrenceId: string | null
): Promise<{ volunteers: CheckinRegistrantResult[]; registrants: CheckinRegistrantResult[] }> {
  // A volunteer is never a registrant: if someone matches as a volunteer, their
  // volunteer record is the canonical check-in subject, so drop their registrant rows.
  const volunteerMemberIds = new Set(matchedVolunteers.map((v) => v.memberId))
  const registrantRows = matchedRegistrants.filter(
    (r) => !(r.memberId && volunteerMemberIds.has(r.memberId))
  )

  const [volunteerEntries, registrantEntries] = await Promise.all([
    Promise.all(
      matchedVolunteers.map(async (v) => ({
        key: `member:${v.memberId}`,
        candidate: await resolveVolunteerCandidate(v, occurrenceId),
      }))
    ),
    Promise.all(
      registrantRows.map(async (r) => ({
        key: registrantIdentityKey(r),
        candidate: await resolveRegistrantCandidate(r, occurrenceId),
      }))
    ),
  ])

  return {
    volunteers: dedupeCheckinCandidates(volunteerEntries),
    registrants: dedupeCheckinCandidates(registrantEntries),
  }
}

async function finishCheckinLookup(
  matchedRegistrants: RegistrantLookupRow[],
  matchedVolunteers: VolunteerLookupRow[],
  occurrenceId: string | null
): Promise<CheckinRegistrantResult | CheckinAmbiguousResult | null> {
  const { volunteers, registrants } = await resolveCheckinCandidates(
    matchedRegistrants,
    matchedVolunteers,
    occurrenceId
  )
  const candidates = volunteers.length > 0 ? volunteers : registrants

  if (candidates.length === 0) return null
  if (candidates.length > 1) return { matchType: "ambiguous", candidates }
  return candidates[0]
}

export async function lookupCheckinRegistrant(
  eventId: string,
  query: string,
  occurrenceId: string | null
): Promise<ActionResult<CheckinRegistrantResult | CheckinAmbiguousResult | null>> {
  const q = query.trim()
  if (!q) return { success: true, data: null }

  try {
    const lq = q.toLowerCase()
    const qNorm = q.replace(/\s+/g, "")

    const matchedRegistrants = (await findEventRegistrantsForLookup(eventId)).filter((r) => {
      const email = r.member?.email ?? r.guest?.email ?? r.email ?? ""
      const phone = r.member?.phone ?? r.guest?.phone ?? r.mobileNumber ?? ""
      return (
        email.toLowerCase() === lq ||
        phone.replace(/\s+/g, "") === qNorm
      )
    })

    // Event volunteers are matched on their linked member's phone/email and recorded
    // with the same attendance machinery.
    const matchedVolunteers = (await findEventVolunteersForLookup(eventId)).filter((v) => {
      const email = v.member.email ?? ""
      const phone = v.member.phone ?? ""
      return email.toLowerCase() === lq || phone.replace(/\s+/g, "") === qNorm
    })

    return {
      success: true,
      data: await finishCheckinLookup(matchedRegistrants, matchedVolunteers, occurrenceId),
    }
  } catch {
    return { success: false, error: "Lookup failed. Please try again." }
  }
}

// Loader/resolver for volunteer check-in subjects, shared by the lookup paths below.
type VolunteerLookupRow = {
  id: string
  attendedAt: Date | null
  memberId: string
  member: {
    firstName: string
    lastName: string
    nickname: string | null
    email: string | null
    phone: string | null
    birthMonth: number | null
    birthYear: number | null
  }
}

function findEventVolunteersForLookup(eventId: string): Promise<VolunteerLookupRow[]> {
  return db.volunteer.findMany({
    where: { eventId },
    select: {
      id: true,
      attendedAt: true,
      memberId: true,
      member: {
        select: {
          firstName: true,
          lastName: true,
          nickname: true,
          email: true,
          phone: true,
          birthMonth: true,
          birthYear: true,
        },
      },
    },
  })
}

async function resolveVolunteerCandidate(
  v: VolunteerLookupRow,
  occurrenceId: string | null
): Promise<CheckinRegistrantResult> {
  let alreadyCheckedIn: boolean
  if (occurrenceId !== null) {
    const existing = await db.occurrenceAttendee.findUnique({
      where: { occurrenceId_volunteerId: { occurrenceId, volunteerId: v.id } },
      select: { id: true },
    })
    alreadyCheckedIn = existing !== null
  } else {
    alreadyCheckedIn = v.attendedAt !== null
  }

  return {
    kind: "volunteer",
    subjectId: v.id,
    name: `${v.member.firstName} ${v.member.lastName}`.trim(),
    nickname: v.member.nickname,
    alreadyCheckedIn,
    contactHint: contactHintFrom(v.member.phone, v.member.email),
    guestSmallGroupPrompt: null,
  }
}

export async function lookupCheckinRegistrantByProfile(
  eventId: string,
  lastName: string,
  birthMonth: number,
  birthYear: number,
  occurrenceId: string | null
): Promise<ActionResult<CheckinRegistrantResult | CheckinAmbiguousResult | null>> {
  const ln = lastName.trim().toLowerCase()
  if (!ln || !birthMonth || !birthYear) return { success: true, data: null }

  try {
    const matchedRegistrants = (await findEventRegistrantsForLookup(eventId)).filter((r) => {
      if (r.member) {
        return (
          r.member.lastName.toLowerCase() === ln &&
          r.member.birthMonth === birthMonth &&
          r.member.birthYear === birthYear
        )
      }
      if (r.guest) {
        return (
          r.guest.lastName.toLowerCase() === ln &&
          r.guest.birthMonth === birthMonth &&
          r.guest.birthYear === birthYear
        )
      }
      return false
    })

    // Match event volunteers by their linked member's last name + birthday.
    const matchedVolunteers = (await findEventVolunteersForLookup(eventId)).filter(
      (v) =>
        v.member.lastName.toLowerCase() === ln &&
        v.member.birthMonth === birthMonth &&
        v.member.birthYear === birthYear
    )

    return {
      success: true,
      data: await finishCheckinLookup(matchedRegistrants, matchedVolunteers, occurrenceId),
    }
  } catch {
    return { success: false, error: "Lookup failed. Please try again." }
  }
}

export async function searchCheckinByName(
  eventId: string,
  query: string,
  occurrenceId: string | null
): Promise<ActionResult<CheckinRegistrantResult[]>> {
  const q = normalizeNameInput(query)
  if (!q || q.length < 2) return { success: true, data: [] }
  const words = q.split(/\s+/).filter(Boolean)

  // Every word must appear somewhere in the name or in a nickname, so "kuya jun
  // santos" still finds "Junior Santos" nicknamed "Kuya Jun".
  function nameContains(first: string, last: string, nicknames: (string | null)[]): boolean {
    const full = normalizeNameInput(`${first} ${last}`)
    const nicks = nicknames.filter(Boolean).map((n) => normalizeNameInput(n as string))
    return words.every((w) => full.includes(w) || nicks.some((n) => n.includes(w)))
  }

  try {
    const allRegistrants = await findEventRegistrantsForLookup(eventId)
    const matchedRegistrants = allRegistrants.filter((r) => {
      const first = r.member?.firstName ?? r.guest?.firstName ?? r.firstName ?? ""
      const last = r.member?.lastName ?? r.guest?.lastName ?? r.lastName ?? ""
      return nameContains(first, last, [
        r.nickname,
        r.member?.nickname ?? null,
        r.guest?.nickname ?? null,
      ])
    })

    const allVolunteers = await findEventVolunteersForLookup(eventId)
    const matchedVolunteers = allVolunteers.filter((v) =>
      nameContains(v.member.firstName, v.member.lastName, [v.member.nickname])
    )

    const { volunteers, registrants } = await resolveCheckinCandidates(
      matchedRegistrants,
      matchedVolunteers,
      occurrenceId
    )

    return {
      success: true,
      data: [...volunteers, ...registrants].slice(0, 15),
    }
  } catch {
    return { success: false, error: "Search failed. Please try again." }
  }
}

// ─── Household registration (CCF-122) ────────────────────────────────────────

/**
 * Register a whole household in one submission: the primary registrant plus
 * every other member, each as its own `EventRegistrant`, all linked to one
 * `Family`.
 *
 * Family identity is the **spouse pair** — a household is deduped by its
 * Father/Husband and Mother/Wife records, never by matching individual members.
 * Spouses reliably carry their own mobile number, so they resolve through the
 * normal dedup ladder; children, who usually have none, are then matched
 * *within* the resolved family instead of being guessed at globally.
 *
 * Family records are created here and only here. Check-in surfaces an existing
 * household and checks its members in, but never creates or edits family
 * structure — the door is not allowed to invent it.
 */
export async function createHouseholdRegistration(
  eventId: string,
  primaryRaw: z.input<typeof registrantSchema>,
  householdRaw: z.input<typeof householdSchema>,
  confirmedMemberId: string | null,
  confirmedGuestId?: string | null,
  skipDeduplication?: boolean,
  selectedBreakoutGroupId?: string | null,
  walkIn?: { occurrenceId: string | null }
): Promise<
  ActionResult<{
    id: string
    familyId: string
    breakoutGroup: AssignedBreakout
    householdRegistrantIds: string[]
    /** Household members who are serving as volunteers, so were not registered. */
    skippedVolunteers: string[]
  }>
> {
  const parsedHousehold = householdSchema.safeParse(householdRaw)
  if (!parsedHousehold.success) {
    return {
      success: false,
      error: parsedHousehold.error.issues[0]?.message ?? "Invalid household details",
    }
  }
  const parsedContext = walkIn ? "WalkIn" : "Register"
  const householdConfig = await getEffectiveFormConfig(eventId, parsedContext)

  // Household capture is itself a section toggle. With it off, a crafted POST must
  // not be able to invent a Family — so the extra members are refused outright
  // rather than quietly dropped, which would look like a successful registration
  // that lost people.
  if (!householdConfig.sectionFamily && parsedHousehold.data.members.length > 0) {
    return {
      success: false,
      error: "This event isn't collecting household details.",
    }
  }

  const household = {
    ...parsedHousehold.data,
    // Per-person demographics obey the same field toggles as the primary's.
    members: parsedHousehold.data.members.map((m) =>
      sanitizeHouseholdMember(householdConfig, m)
    ),
  }

  // The primary goes through the normal path so the registration window, the
  // volunteer guard, dedup, breakout assignment and walk-in check-in all apply
  // exactly as they do for a solo registration.
  const primaryResult = await createRegistrant(
    eventId,
    primaryRaw,
    confirmedMemberId,
    confirmedGuestId,
    skipDeduplication,
    selectedBreakoutGroupId,
    walkIn
  )
  if (!primaryResult.success) return primaryResult

  const primaryRegistrantId = primaryResult.data.id

  try {
    const primaryRegistrant = await db.eventRegistrant.findUniqueOrThrow({
      where: { id: primaryRegistrantId },
      select: {
        memberId: true,
        guestId: true,
        member: { select: { lastName: true } },
        guest: { select: { lastName: true } },
      },
    })

    const primaryRef: FamilyPersonRef = primaryRegistrant.memberId
      ? { memberId: primaryRegistrant.memberId }
      : { guestId: primaryRegistrant.guestId as string }

    const primaryLastName =
      primaryRegistrant.member?.lastName ??
      primaryRegistrant.guest?.lastName ??
      (typeof primaryRaw.lastName === "string" ? primaryRaw.lastName : "")

    // ── Resolve the family ──────────────────────────────────────────────────
    // Matching keys on the PRIMARY's spouse-role link only. "Either spouse is
    // enough to match" holds because whichever spouse fills the form is the
    // primary, and the primary has already been deduped by their own contact
    // details in createRegistrant above.
    //
    // A spouse entered as a *household member* carries only a name and birth
    // date (contact details belong to the primary), so matching a family
    // through them would be exactly the fragile name-based guess that keying
    // family identity on the spouse pair exists to avoid. We don't try.
    //
    // Two different existing families are likewise never merged here — that's
    // destructive and belongs to an admin in the Families module.
    let familyId: string | null = null
    const primaryFamily = await findFamilyBySpouse(primaryRef)
    if (primaryFamily) familyId = primaryFamily.id

    const familyName = household.familyName ?? deriveFamilyName(primaryLastName)

    if (!familyId) {
      familyId = (
        await db.family.create({
          data: { name: familyName },
          select: { id: true },
        })
      ).id
    }

    // The primary's own family link. An existing role is left alone so this
    // never stomps an admin correction.
    const existingPrimaryLink = await db.familyMember.findFirst({
      where: {
        familyId,
        ...(primaryRef.memberId
          ? { memberId: primaryRef.memberId }
          : { guestId: primaryRef.guestId }),
      },
      select: { id: true },
    })
    if (!existingPrimaryLink) {
      await db.familyMember.create({
        data: {
          familyId,
          memberId: primaryRef.memberId ?? null,
          guestId: primaryRef.guestId ?? null,
          role: household.primaryRole,
        },
      })
    }

    // ── Household members ───────────────────────────────────────────────────
    const householdRegistrantIds: string[] = []
    const skippedVolunteers: string[] = []

    for (const person of household.members) {
      // Match inside the family first — this is the whole point of keying family
      // identity on the spouse pair. A child with no contact details is
      // identified by name within their own household, not against every Guest
      // in the database.
      const familyRoster = await db.familyMember.findMany({
        where: { familyId },
        select: {
          role: true,
          memberId: true,
          guestId: true,
          member: { select: { id: true, firstName: true, lastName: true, birthYear: true } },
          guest: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              birthYear: true,
              ageRangeBucketId: true,
            },
          },
        },
      })

      const sameName = (a: string, b: string) =>
        a.trim().toLowerCase() === b.trim().toLowerCase()

      // Identity within a family is name + role (+ birth year when both sides
      // have one). Role matters: without it, a household listing two people who
      // share a name in different roles collapses them into one person.
      const existingInFamily = familyRoster.find((link) => {
        const p = link.member ?? link.guest
        if (!p) return false
        if (!sameName(p.firstName, person.firstName)) return false
        if (!sameName(p.lastName, person.lastName)) return false
        if (link.role !== person.role) return false
        // Birth year, when both sides have one, must agree — distinguishes a
        // junior sharing a parent's name and role.
        if (person.birthYear != null && p.birthYear != null) {
          return p.birthYear === person.birthYear
        }
        return true
      })

      let personRef: FamilyPersonRef
      if (existingInFamily) {
        personRef = existingInFamily.memberId
          ? { memberId: existingInFamily.memberId }
          : { guestId: existingInFamily.guestId as string }
        // Backfill only what's missing; never overwrite known data.
        if (existingInFamily.guestId) {
          const g = existingInFamily.guest
          await db.guest.update({
            where: { id: existingInFamily.guestId },
            data: {
              ...(g?.birthYear == null && person.birthYear != null
                ? { birthYear: person.birthYear, birthMonth: person.birthMonth ?? null }
                : {}),
              ...(g?.ageRangeBucketId == null && person.ageRangeBucketId != null
                ? { ageRangeBucketId: person.ageRangeBucketId }
                : {}),
            },
          })
        }
      } else {
        const newGuest = await db.guest.create({
          data: {
            firstName: person.firstName,
            lastName: person.lastName,
            nickname: person.nickname,
            // Contact details stay on the primary — see lib/validations/household.ts.
            email: null,
            phone: null,
            birthMonth: person.birthMonth ?? null,
            birthYear: person.birthYear ?? null,
            gender: person.gender ?? null,
            ageRangeBucketId: person.ageRangeBucketId,
            language: [],
          },
          select: { id: true },
        })
        personRef = { guestId: newGuest.id }
        await db.familyMember.create({
          data: { familyId, guestId: newGuest.id, role: person.role },
        })
      }

      // Ensure a family link exists even when the person was matched by an
      // earlier registration that predates their family membership.
      const hasLink = await db.familyMember.findFirst({
        where: {
          familyId,
          ...(personRef.memberId ? { memberId: personRef.memberId } : { guestId: personRef.guestId }),
        },
        select: { id: true },
      })
      if (!hasLink) {
        await db.familyMember.create({
          data: {
            familyId,
            memberId: personRef.memberId ?? null,
            guestId: personRef.guestId ?? null,
            role: person.role,
          },
        })
      }

      // Volunteers don't register as attendees. The primary path errors out for
      // this; for a household member, erroring the whole submission would be
      // harsh, so they keep their family link and are reported back instead.
      if (personRef.memberId) {
        const servingVolunteer = await db.volunteer.findFirst({
          where: { memberId: personRef.memberId, eventId },
          select: { id: true },
        })
        if (servingVolunteer) {
          skippedVolunteers.push(`${person.firstName} ${person.lastName}`.trim())
          continue
        }
      }

      // One registrant per person per event — reuse an existing row.
      const existingRegistrant = await db.eventRegistrant.findFirst({
        where: {
          eventId,
          ...(personRef.memberId
            ? { memberId: personRef.memberId }
            : { guestId: personRef.guestId }),
        },
        select: { id: true },
      })

      const registrantId =
        existingRegistrant?.id ??
        (
          await db.eventRegistrant.create({
            data: {
              eventId,
              memberId: personRef.memberId ?? null,
              guestId: personRef.guestId ?? null,
            },
            select: { id: true },
          })
        ).id

      // Deliberately NO breakout assignment for household members. Age-based
      // auto-assign would scatter siblings across different groups, and breakout
      // grouping is itself optional per event (CCF-128) — a family event that
      // uses breakouts should place a household together, which is an admin
      // decision rather than something to infer per person here.

      if (walkIn) {
        await checkInWalkInRegistrant(registrantId, walkIn.occurrenceId)
      } else {
        await autoCheckinIfOpenRecurringSession(registrantId, eventId)
      }

      if (!householdRegistrantIds.includes(registrantId)) {
        householdRegistrantIds.push(registrantId)
      }
    }

    revalidatePath(`/event/${eventId}/registrants`)
    revalidatePath("/families")

    return {
      success: true,
      data: {
        id: primaryRegistrantId,
        familyId,
        breakoutGroup: primaryResult.data.breakoutGroup,
        householdRegistrantIds,
        skippedVolunteers,
      },
    }
  } catch {
    // The primary is already registered at this point; surface that rather than
    // implying nothing happened.
    return {
      success: false,
      error: "You're registered, but we couldn't save your household. Please contact an admin.",
    }
  }
}

// ─── Household check-in (CCF-122) ────────────────────────────────────────────

export type HouseholdCheckinMember = {
  registrantId: string
  name: string
  nickname: string | null
  role: string
  alreadyCheckedIn: boolean
  /** The person filling in at the kiosk — rendered as "you" and pre-selected. */
  isSubject: boolean
}

export type HouseholdCheckin = {
  familyId: string
  familyName: string
  members: HouseholdCheckinMember[]
}

/**
 * Surface the household of an already-checked-in registrant so staff can check
 * the rest of them in together.
 *
 * Read-only: this never creates or edits family structure — that's
 * `addHouseholdMemberAtCheckin`, which is an explicit admin action at the door.
 *
 * Returns the household even when the subject is its only registered member, so
 * the caller can still offer "+ Add family member". Returns null only when the
 * person belongs to no family at all; lazy creation then happens on the first
 * add.
 */
export async function lookupHouseholdForCheckin(
  eventId: string,
  registrantId: string,
  occurrenceId: string | null
): Promise<ActionResult<HouseholdCheckin | null>> {
  try {
    const registrant = await db.eventRegistrant.findFirst({
      where: { id: registrantId, eventId },
      select: { id: true, memberId: true, guestId: true },
    })
    if (!registrant) return { success: true, data: null }

    const link = await db.familyMember.findFirst({
      where: registrant.memberId
        ? { memberId: registrant.memberId }
        : { guestId: registrant.guestId as string },
      select: { familyId: true, family: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    })
    if (!link) return { success: true, data: null }

    const roster = await db.familyMember.findMany({
      where: { familyId: link.familyId },
      select: {
        role: true,
        memberId: true,
        guestId: true,
        member: { select: { firstName: true, lastName: true, nickname: true } },
        guest: { select: { firstName: true, lastName: true, nickname: true } },
      },
    })

    const memberIds = roster.flatMap((r) => (r.memberId ? [r.memberId] : []))
    const guestIds = roster.flatMap((r) => (r.guestId ? [r.guestId] : []))

    const registrants = await db.eventRegistrant.findMany({
      where: {
        eventId,
        OR: [
          ...(memberIds.length ? [{ memberId: { in: memberIds } }] : []),
          ...(guestIds.length ? [{ guestId: { in: guestIds } }] : []),
        ],
      },
      select: {
        id: true,
        memberId: true,
        guestId: true,
        attendedAt: true,
        occurrenceAttendances: occurrenceId
          ? { where: { occurrenceId }, select: { id: true } }
          : false,
      },
    })

    const members: HouseholdCheckinMember[] = []
    for (const r of registrants) {
      const rosterEntry = roster.find((x) =>
        r.memberId ? x.memberId === r.memberId : x.guestId === r.guestId
      )
      if (!rosterEntry) continue
      const p = rosterEntry.member ?? rosterEntry.guest
      if (!p) continue

      const alreadyCheckedIn = occurrenceId
        ? (r.occurrenceAttendances?.length ?? 0) > 0
        : r.attendedAt !== null

      members.push({
        registrantId: r.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
        nickname: p.nickname,
        role: rosterEntry.role,
        alreadyCheckedIn,
        isSubject: r.id === registrant.id,
      })
    }

    // Subject first, then everyone still to be checked in, then those already in.
    members.sort((a, b) => {
      if (a.isSubject !== b.isSubject) return a.isSubject ? -1 : 1
      if (a.alreadyCheckedIn !== b.alreadyCheckedIn) return a.alreadyCheckedIn ? 1 : -1
      return a.name.localeCompare(b.name)
    })

    return {
      success: true,
      data: { familyId: link.family.id, familyName: link.family.name, members },
    }
  } catch {
    return { success: false, error: "Failed to look up household" }
  }
}

/**
 * Check in several registrants from one household in a single action. Records
 * attendance only — never touches family structure.
 */
export async function checkInHousehold(
  eventId: string,
  registrantIds: string[],
  occurrenceId: string | null
): Promise<ActionResult<{ checkedIn: number }>> {
  if (registrantIds.length === 0) {
    return { success: false, error: "Select at least one person to check in." }
  }
  try {
    // Scope to this event so a hand-crafted id can't check someone into an
    // event they aren't registered for.
    const valid = await db.eventRegistrant.findMany({
      where: { id: { in: registrantIds }, eventId },
      select: { id: true },
    })
    if (valid.length === 0) {
      return { success: false, error: "Those registrations don't belong to this event." }
    }

    for (const r of valid) {
      if (occurrenceId) {
        await db.occurrenceAttendee.upsert({
          where: { occurrenceId_registrantId: { occurrenceId, registrantId: r.id } },
          create: { occurrenceId, registrantId: r.id },
          update: {},
        })
      } else {
        await db.eventRegistrant.update({
          where: { id: r.id },
          data: { attendedAt: new Date() },
        })
      }
    }

    revalidatePath(`/event/${eventId}/registrants`)
    return { success: true, data: { checkedIn: valid.length } }
  } catch {
    return { success: false, error: "Failed to check in household" }
  }
}

/**
 * Add someone to the subject's household at the door and check them in.
 *
 * This is the one check-in path allowed to create family structure. It lazily
 * creates the `Family` when the subject has none — nothing is forced until
 * there's a second person, so a solo attendee never gets a spurious family
 * record just for checking in.
 *
 * The subject is back-linked as `Other` rather than a guessed spouse role:
 * inferring Father/Mother from a kiosk interaction would be a guess, and roles
 * are correctable in the Families module. Note that a family created this way
 * won't participate in spouse-pair dedupe until someone sets a spouse role.
 */
export async function addHouseholdMemberAtCheckin(
  eventId: string,
  subjectRegistrantId: string,
  raw: z.input<typeof householdMemberSchema>,
  occurrenceId: string | null
): Promise<ActionResult<{ familyId: string; registrantId: string }>> {
  const parsed = householdMemberSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid details" }
  }

  // This is the one check-in path that creates family structure, so it obeys the
  // Check-in context's Family section. Surfacing and checking in an existing
  // household stays available either way — only inventing new links is gated.
  const checkinConfig = await getEffectiveFormConfig(eventId, "CheckIn")
  if (!checkinConfig.sectionFamily) {
    return { success: false, error: "This event isn't collecting household details." }
  }
  const person = sanitizeHouseholdMember(checkinConfig, parsed.data)

  try {
    const subject = await db.eventRegistrant.findFirst({
      where: { id: subjectRegistrantId, eventId },
      select: {
        memberId: true,
        guestId: true,
        member: { select: { lastName: true } },
        guest: { select: { lastName: true } },
      },
    })
    if (!subject) {
      return { success: false, error: "That registration doesn't belong to this event." }
    }

    const subjectRef: FamilyPersonRef = subject.memberId
      ? { memberId: subject.memberId }
      : { guestId: subject.guestId as string }

    // ── Lazy family creation ────────────────────────────────────────────────
    let familyId: string
    const existingLink = await db.familyMember.findFirst({
      where: subjectRef.memberId
        ? { memberId: subjectRef.memberId }
        : { guestId: subjectRef.guestId },
      select: { familyId: true },
      orderBy: { createdAt: "asc" },
    })

    if (existingLink) {
      familyId = existingLink.familyId
    } else {
      const lastName = subject.member?.lastName ?? subject.guest?.lastName ?? ""
      const family = await db.family.create({
        data: { name: deriveFamilyName(lastName) },
        select: { id: true },
      })
      familyId = family.id
      await db.familyMember.create({
        data: {
          familyId,
          memberId: subjectRef.memberId ?? null,
          guestId: subjectRef.guestId ?? null,
          role: "Other",
        },
      })
    }

    // ── Resolve the person, scoped to the family ────────────────────────────
    const roster = await db.familyMember.findMany({
      where: { familyId },
      select: {
        memberId: true,
        guestId: true,
        member: { select: { firstName: true, lastName: true, birthYear: true } },
        guest: { select: { firstName: true, lastName: true, birthYear: true } },
      },
    })
    const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
    const match = roster.find((link) => {
      const p = link.member ?? link.guest
      if (!p) return false
      if (!sameName(p.firstName, person.firstName)) return false
      if (!sameName(p.lastName, person.lastName)) return false
      if (person.birthYear != null && p.birthYear != null) return p.birthYear === person.birthYear
      return true
    })

    let personRef: FamilyPersonRef
    if (match) {
      personRef = match.memberId
        ? { memberId: match.memberId }
        : { guestId: match.guestId as string }
    } else {
      const guest = await db.guest.create({
        data: {
          firstName: person.firstName,
          lastName: person.lastName,
          nickname: person.nickname,
          birthMonth: person.birthMonth ?? null,
          birthYear: person.birthYear ?? null,
          gender: person.gender ?? null,
          ageRangeBucketId: person.ageRangeBucketId,
          language: [],
        },
        select: { id: true },
      })
      personRef = { guestId: guest.id }
      await db.familyMember.create({
        data: { familyId, guestId: guest.id, role: person.role },
      })
    }

    // ── Registrant, deduped at the registrant level ──────────────────────────
    // One registrant per person per event, so attendance counts once.
    const existingRegistrant = await db.eventRegistrant.findFirst({
      where: {
        eventId,
        ...(personRef.memberId ? { memberId: personRef.memberId } : { guestId: personRef.guestId }),
      },
      select: { id: true },
    })
    const registrantId =
      existingRegistrant?.id ??
      (
        await db.eventRegistrant.create({
          data: {
            eventId,
            memberId: personRef.memberId ?? null,
            guestId: personRef.guestId ?? null,
          },
          select: { id: true },
        })
      ).id

    // No breakout assignment — see createHouseholdRegistration.
    if (occurrenceId) {
      await db.occurrenceAttendee.upsert({
        where: { occurrenceId_registrantId: { occurrenceId, registrantId } },
        create: { occurrenceId, registrantId },
        update: {},
      })
    } else {
      await db.eventRegistrant.update({
        where: { id: registrantId },
        data: { attendedAt: new Date() },
      })
    }

    revalidatePath(`/event/${eventId}/registrants`)
    revalidatePath("/families")
    return { success: true, data: { familyId, registrantId } }
  } catch {
    return { success: false, error: "Failed to add household member" }
  }
}
