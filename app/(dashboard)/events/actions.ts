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
import { isSetupStepKey } from "@/lib/events/setup-checklist"
import {
  matchingProfileSchema,
  type MatchingProfileInput,
} from "@/lib/validations/matching-profile"
import {
  applyGuestMatchingProfile,
  applyMemberMatchingProfile,
} from "@/lib/people/matching-profile"
import {
  checkInWalkInRegistrant,
  completeEventRegistration,
  findEventVolunteerConflict,
  findExistingEventRegistration,
  resolveAnonymousGuest,
  resolveConfirmedGuest,
  resolveConfirmedMember,
  type TouchedFields,
  type AssignedBreakout,
} from "@/lib/events/registration-core"
import { ProfileCollisionError } from "@/lib/events/profile-merge"
import { verifyIdentityGrant, type GrantSubject } from "@/lib/security/identity-grant"
import { isEventStaffViewer } from "@/lib/events/staff-viewer"
import { registrantSchema } from "@/lib/validations/event-registrant"
import {
  findMatchingSeries,
  normalizeUtcDate,
  rangesOverlap,
  seriesContainsDate,
} from "@/lib/events/occurrence-series"
import { isWithinRegistrationWindow } from "@/lib/events/registration-window"
import { latestWalkInSession } from "@/lib/events/walk-in-session"
import { fieldsForContext } from "@/lib/forms/context-config"
import { getEffectiveFormConfig } from "@/lib/forms/context-config-server"
import {
  HOUSEHOLD_MEMBER_FIELD_KEYS,
  askedFieldsFor,
  missingRequiredFields,
  omitDisabledFields,
  requiredFieldLabels,
  requiredFieldsMessage,
  resolveBreakoutSelection,
  sanitizeHouseholdMember,
  sanitizeRegistrantPayload,
} from "@/lib/forms/registration-payload"
import { findFamilyBySpouse, type FamilyPersonRef } from "@/lib/family-links"
import { householdBackfill } from "@/lib/households/backfill"
import {
  deriveFamilyName,
  householdMemberSchema,
  householdSchema,
} from "@/lib/validations/household"
import { formatPhilippinePhone } from "@/lib/utils"
import { contactHintFrom } from "@/lib/contact-hint"
import {
  buildNameMatcher,
  findEventRegistrantsForLookup,
  findEventVolunteersForLookup,
  matchesContactQuery,
  registrantContact,
  registrantIdentityKey,
  type CheckinSubject,
  type CheckinSubjectKind,
  type RegistrantLookupRow,
  type VolunteerLookupRow,
} from "@/lib/events/checkin-lookup"
import { recordMemberGroupClaim } from "@/lib/small-groups/member-claim"
import { createSeekerRequestFromRegistration } from "@/lib/small-groups/seeker-requests"
import type { Gender } from "@/app/generated/prisma/client"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * Why a registration was refused, for the cases where the client has to do more
 * than print the message.
 *
 * Only the duplicate needs it today: it routes to a screen with somewhere to go
 * next rather than a toast that fades off a form the person just filled in.
 * Matching on the copy to decide that would break the first time anyone rewords
 * it, so the reason travels as its own field.
 */
export type RegistrationFailureReason = "alreadyRegistered"

type RegistrationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; reason?: RegistrationFailureReason }

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

/**
 * Skips (or un-skips) a single walkthrough step. Unlike dismissing, this keeps the
 * rest of the checklist on screen — it just stops nagging about the one step the
 * admin has decided this event doesn't need.
 *
 * The write is a read-modify-write rather than a `push`, so skipping the same step
 * twice can't duplicate a key.
 */
export async function setEventSetupStepSkipped(
  eventId: string,
  stepKey: string,
  skipped: boolean,
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (!isSetupStepKey(stepKey)) {
    return { success: false, error: "Unknown setup step" }
  }

  try {
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { setupSkippedSteps: true },
    })
    if (!event) return { success: false, error: "Event not found" }

    const next = new Set(event.setupSkippedSteps)
    if (skipped) next.add(stepKey)
    else next.delete(stepKey)

    await db.event.update({
      where: { id: eventId },
      data: { setupSkippedSteps: [...next] },
    })
    revalidatePath(`/event/${eventId}/dashboard`)
    return { success: true, data: undefined }
  } catch {
    return {
      success: false,
      error: skipped ? "Failed to skip step" : "Failed to restore step",
    }
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
  walkIn?: { occurrenceId: string | null },
  // Fields the person edited on the review screen (CCF-147) — these overwrite the
  // stored profile; everything else keeps fill-if-empty.
  touchedFields?: TouchedFields,
  // Proof that the caller owns the record named by `confirmedMemberId` /
  // `confirmedGuestId`, minted by `revealProfileForRegistration` after the second
  // factor. Without it `touchedFields` is ignored — see `grantedTouchedFields`.
  grant?: string | null
): Promise<RegistrationResult<{ id: string; breakoutGroup: AssignedBreakout }>> {
  const parsed = registrantSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    /**
     * Which record this submission claims to be, when it claims to be one at all.
     * Resolved up front because both the window check and the duplicate guard need
     * to know whether this is a *new* registration or an amendment to an existing
     * one, and asking twice would let the two disagree.
     */
    const confirmedSubject: GrantSubject | null = confirmedMemberId
      ? { recordId: confirmedMemberId, recordType: "member" }
      : confirmedGuestId
        ? { recordId: confirmedGuestId, recordType: "guest" }
        : null

    const existingForConfirmed = confirmedSubject
      ? await findExistingEventRegistration(
          eventId,
          confirmedSubject.recordType === "member"
            ? { memberId: confirmedSubject.recordId }
            : { guestId: confirmedSubject.recordId }
        )
      : null

    /** A proven owner updating the registration they already hold. */
    const isAmend =
      existingForConfirmed !== null &&
      !walkIn &&
      confirmedSubject !== null &&
      verifyIdentityGrant(grant, confirmedSubject)

    // Enforce the event's Opens/Closes window server-side. Walk-ins are exempt:
    // they're staff-supervised at the door and must go through even after close.
    // So is an amendment: the window governs who may *join*, and this person
    // joined before it shut. The case it exists for is an admin who made a field
    // required after registration closed — enforcing the window there would make
    // the answer uncollectable by the only route that asks for it.
    if (!walkIn && !isAmend) {
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
    // Required fields are checked *after* sanitizing, so a value submitted for a
    // disabled field can't satisfy a stale required flag on that same field.
    //
    // Payment comes out of the check on an amend, because the amend refuses to
    // *collect* it: the form drops the step and the branch below nulls the value
    // outright. Leaving it in made a required Payment section unsatisfiable —
    // "Payment reference is required" against a form with no payment step, on the
    // only route the event offers for answering. `fieldsStillNeeded` already
    // filters it client-side for the same reason; this is the server half.
    // Every other requirable key still applies: an amend is exactly where an
    // admin's newly-required field is meant to get answered.
    const asked = askedFieldsFor(walkIn ? "WalkIn" : "Register", parsed.data).filter(
      (key) => !(isAmend && key === "sectionPayment")
    )
    const missing = missingRequiredFields(formConfig, parsed.data, asked)
    if (missing.length > 0) {
      return { success: false, error: requiredFieldsMessage(missing) }
    }
    // A submitted breakout pick counts only where the picker is offered. Auto-assign
    // runs off a null selection, so it is unaffected.
    const breakoutPick = resolveBreakoutSelection(formConfig, selectedBreakoutGroupId)

    // Going over a group's member limit is a staff decision taken at the door
    // (CCF-141). `walkIn` alone can't authorise it: the walk-in route is public,
    // so that flag is self-asserted by the request. Both halves are required —
    // signed-in staff pre-registering someone don't get the override either,
    // because the form they used never offered a full group.
    const allowOverCapacity = !!walkIn && (await isEventStaffViewer())

    /**
     * `touchedFields` is not a preference — it is the privilege to **overwrite**
     * stored profile data instead of only filling blanks. It therefore has to be
     * earned per record, and this is where that is decided.
     *
     * Before the grant existed, `confirmedMemberId` arrived from a public client
     * as a bare string and was trusted, so a crafted POST naming any member could
     * rewrite that person's email, phone, birthday or availability. The old
     * comment on `TouchedFields` claimed the step-0 second factor gated this; it
     * did not, and the mid-form confirm path never asked for a second factor at
     * all. An unproven caller now falls back to fill-if-empty, which is what every
     * caller did before CCF-147 — registration still works, it just can't
     * clobber.
     */
    const grantedTouchedFields = (subject: GrantSubject): TouchedFields =>
      verifyIdentityGrant(grant, subject) ? touchedFields : null

    /**
     * Whether an existing registration blocks this submission, or is the thing it
     * came to update.
     *
     * Registering twice is still refused — that is what the duplicate guard is
     * for, and it stays the default for anyone the request can't prove. Two cases
     * get through instead:
     *
     *  - **Walk-in.** The door reuses the registration and checks the person in.
     *  - **Amend.** The admin enabled or required a field after this person signed
     *    up, so the form has to collect it against the registration they already
     *    have. Only on proof of ownership: without the grant this would let a
     *    crafted POST rewrite a stranger's answers, which is a worse hole than the
     *    one the duplicate guard closes.
     */
    const isBlockedDuplicate = existingForConfirmed !== null && !walkIn && !isAmend

    /** The person-facing half of the same fact, kept in one place. */
    const DUPLICATE_ERROR = "You're already registered for this event."

    /**
     * Payment is not amendable from a public form.
     *
     * Rewriting a payment reference on a registration that already exists is a
     * different decision from filling in a life stage the event has started
     * asking for: it touches money, and it stays with the admin. The form omits
     * the step on an amend; this is the server half, so a hand-built payload
     * can't reach it either. The walk-in door is exempt — staff are standing
     * there taking the payment.
     */
    if (isAmend) parsed.data.paymentReference = null

    // The steps below (person resolution → per-event completion) live in
    // lib/events/registration-core.ts so the cluster shared form (CCF-132) can
    // resolve the person once and fan out across events. The order here is the
    // same as before the extraction: guards fire before any profile write.
    if (confirmedMemberId) {
      // Volunteer guard — volunteers don't need to register as attendees
      if (await findEventVolunteerConflict(eventId, confirmedMemberId)) {
        return { success: false, error: "You're serving as a volunteer at this event — you don't need to register as an attendee." }
      }

      if (isBlockedDuplicate) {
        return { success: false, error: DUPLICATE_ERROR, reason: "alreadyRegistered" }
      }
      const existingRegistrationId = existingForConfirmed

      const touched = grantedTouchedFields({
        recordId: confirmedMemberId,
        recordType: "member",
      })
      const stored = await resolveConfirmedMember(confirmedMemberId, parsed.data, touched)
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
        allowOverCapacity,
        existingRegistrantId: existingRegistrationId,
        touchedFields: touched,
      })
      return { success: true, data: result }
    } else if (confirmedGuestId) {
      if (isBlockedDuplicate) {
        return { success: false, error: DUPLICATE_ERROR, reason: "alreadyRegistered" }
      }
      const existingRegistrationId = existingForConfirmed

      const touched = grantedTouchedFields({
        recordId: confirmedGuestId,
        recordType: "guest",
      })
      const stored = await resolveConfirmedGuest(confirmedGuestId, parsed.data, touched)
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
        allowOverCapacity,
        existingRegistrantId: existingRegistrationId,
        touchedFields: touched,
      })
      return { success: true, data: result }
    } else {
      // Non-member — find or create Guest (dedup ladder: phone → email →
      // last name + birthday), then link via guestId
      const { guestId } = await resolveAnonymousGuest(parsed.data, skipDeduplication)

      // Duplicate check — guest already registered for this event (walk-in reuses it)
      // No confirmed record means nothing was proven, so there is no amend here —
      // only the walk-in door reuses a registration on this path.
      const existingRegistrationId = await findExistingEventRegistration(eventId, { guestId })
      if (existingRegistrationId && !walkIn) {
        return { success: false, error: DUPLICATE_ERROR, reason: "alreadyRegistered" }
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
        allowOverCapacity,
        existingRegistrantId: existingRegistrationId,
        // No confirmed record means nothing was proven, so an edit here can only
        // ever fill a blank. The dedup ladder may well have landed on an existing
        // guest, which is exactly why this isn't waved through.
        touchedFields: null,
      })
      return { success: true, data: result }
    }
  } catch (error) {
    // A contact collision is the person's to fix, so it has to survive the
    // catch-all as itself rather than becoming "please try again".
    if (error instanceof ProfileCollisionError) {
      return { success: false, error: error.message }
    }
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

/**
 * Open or close a session's check-in — and point the walk-in door at it.
 *
 * The walk-in form gates on `Event.walkInOccurrenceId` (CCF-133), which was its
 * own setting on Forms → Walk-in. That left two switches for one act: staff
 * opened check-in on this screen and the door still read "No session is open for
 * walk-in right now", because nothing had named the session. Opening check-in is
 * the moment a session becomes the live one, so it is the moment that names it.
 *
 * Still a single stored target rather than a fallback search — a walk-in must
 * never resolve to a session nobody chose, which is the bug the stored field was
 * introduced to kill. Forms → Walk-in stays, for pointing the door somewhere
 * other than the session you just opened.
 *
 * Closing only clears the pointer when it points *here*, so closing yesterday's
 * session cannot shut a door aimed at today's.
 *
 * An event set to follow its latest session has no pointer to move: the door is
 * resolved per request. This still reports whether the door moved, by asking
 * whether *this* session is the latest one — a toast that claimed "walk-in now
 * registers into this session" while the door sat on a newer one would be worse
 * than no toast.
 */
export async function setOccurrenceCheckinOpen(
  occurrenceId: string,
  isOpen: boolean
): Promise<ActionResult<{ walkInChanged: boolean }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    // The owning event is read from the occurrence. It used to be a third
    // argument, fine when it only fed revalidatePath — but it now picks which
    // event's walk-in door moves, and a caller doesn't get to decide that.
    const occurrence = await db.eventOccurrence.findUnique({
      where: { id: occurrenceId },
      select: { id: true, eventId: true, event: { select: { walkInSessionMode: true } } },
    })
    if (!occurrence) return { success: false, error: "Session not found" }

    await db.eventOccurrence.update({
      where: { id: occurrenceId },
      data: { isOpen },
    })

    // Reported back so the UI can say what happened to the door instead of
    // guessing: closing a session the door was never aimed at leaves it alone.
    let walkInChanged = true
    if (occurrence.event.walkInSessionMode === "Latest") {
      const latest = await latestWalkInSession(occurrence.eventId)
      walkInChanged = latest?.id === occurrenceId
    } else if (isOpen) {
      await db.event.update({
        where: { id: occurrence.eventId },
        data: { walkInOccurrenceId: occurrenceId },
      })
    } else {
      // updateMany so "clear it only if it still points here" is one atomic
      // condition instead of a read the next request could race.
      const cleared = await db.event.updateMany({
        where: { id: occurrence.eventId, walkInOccurrenceId: occurrenceId },
        data: { walkInOccurrenceId: null },
      })
      walkInChanged = cleared.count > 0
    }

    revalidatePath(`/event/${occurrence.eventId}/sessions`)
    revalidatePath(`/event/${occurrence.eventId}/forms/EventWalkIn`)
    revalidatePath(`/events/${occurrence.eventId}/walk-in`)
    revalidatePath(`/events/${occurrence.eventId}/checkin`)
    revalidatePath(`/events/${occurrence.eventId}/checkin/${occurrenceId}`)
    return { success: true, data: { walkInChanged } }
  } catch {
    return { success: false, error: "Failed to update session" }
  }
}

/**
 * Who the DGroup prompt is about. Guests and members both get asked; the two
 * records just store the answers in different places, so every write the kiosk
 * makes has to carry which one it is.
 */
export type CheckinPerson = { guestId: string } | { memberId: string }

type SmallGroupPrompt = {
  person: CheckinPerson
  /**
   * There used to be a `canClaimGroup` flag here gating the "I'm already in one"
   * branch to guests. The reason was storage, not policy: a guest has
   * `claimedSmallGroupId` to put a self-report in, and a member had nowhere —
   * `Member.smallGroupId` is real membership, which only an admin may set.
   *
   * `recordMemberGroupClaim` closes that gap the way the member portal already
   * did — a member naming a leader raises a *Pending* request rather than
   * writing membership — so the branch is offered to everyone this prompt
   * reaches, which is only ever a guest or a member. The public registration
   * form draws the same line.
   */
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

export type { CheckinSubjectKind, CheckinSubject } from "@/lib/events/checkin-lookup"

type CheckinRegistrantResult = {
  kind: CheckinSubjectKind
  subjectId: string
  name: string
  nickname: string | null
  alreadyCheckedIn: boolean
  // Masked phone/email so same-name candidates on the disambiguation screen can
  // be told apart without exposing full contact details on a public page.
  contactHint: string | null
  // Set when the person checking in has no DGroup yet — for registrants and for
  // volunteers alike, since a volunteer is a member who may also be unplaced.
  smallGroupPrompt: SmallGroupPrompt | null
}

type CheckinAmbiguousResult = {
  matchType: "ambiguous"
  candidates: CheckinRegistrantResult[]
}

// ── Shared check-in lookup machinery ──────────────────────────────────────────
// The loaders, matchers and identity key live in `lib/events/checkin-lookup.ts`
// so the cluster kiosk can reuse them across a whole day's events. The
// single-event path below composes the same pieces in the same order it always
// ran them, passing `[eventId]`.

/**
 * An open request means an admin already has this person in the placement queue.
 * Asking again at a kiosk would only produce a duplicate row on the same screen.
 *
 * *Open* means unresolved, which is narrower than "not Rejected". A Confirmed
 * request keeps its row forever — every removal path (`removeMemberFromGroup`,
 * the portal's `removeMemberFromLedGroup`, catch-mech's remove) only nulls
 * `Member.smallGroupId`, leaving the old Confirmed row behind. Treating that as
 * open silenced the prompt permanently for a member who joined a group and later
 * left, which is precisely who this question is for.
 */
function hasOpenGroupRequest(requests: { status: string; resolvedAt: Date | null }[]): boolean {
  return requests.some((r) => r.resolvedAt === null && r.status !== "Rejected")
}

type GuestPromptRow = NonNullable<RegistrantLookupRow["guest"]>

function guestSmallGroupPrompt(guestId: string, g: GuestPromptRow): SmallGroupPrompt | null {
  // A guest who named a satellite has already told us they're in a DGroup —
  // there's just no local group to link. Don't ask them again at check-in.
  const noClaimedGroup = !g.claimedSmallGroupId && !g.claimedSatellite
  if (!noClaimedGroup || hasOpenGroupRequest(g.groupRequests)) return null
  return {
    person: { guestId },
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

type MemberPromptRow = NonNullable<RegistrantLookupRow["member"]>

/**
 * Members get the same prompt as guests. A member is usually in a group — that
 * is how most members come to exist — but one added directly by an admin, or
 * one who has left a group, has `smallGroupId = null` and is exactly who this
 * question is for.
 */
function memberSmallGroupPrompt(memberId: string, m: MemberPromptRow): SmallGroupPrompt | null {
  if (m.smallGroupId) return null
  // A member who named another CCF satellite has already told us they're in a
  // DGroup — there's just no local group to link, exactly like a guest with a
  // `claimedSatellite`. Don't ask them again.
  if (m.upwardSatellite) return null
  if (hasOpenGroupRequest(m.groupRequests)) return null
  // Members keep availability in a relation; the kiosk form edits one slot.
  const slot = m.schedulePreferences[0] ?? null
  return {
    person: { memberId },
    existingProfile: {
      lifeStageId: m.lifeStageId,
      gender: m.gender,
      language: m.language,
      meetingPreference: m.meetingPreference,
      workCity: m.workCity,
      scheduleDayOfWeek: slot?.dayOfWeek ?? null,
      scheduleTimeStart: slot?.timeStart ?? null,
      scheduleTimeEnd: slot?.timeEnd ?? null,
      ageRangeBucketId: m.ageRangeBucketId,
    },
  }
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

  let smallGroupPrompt: SmallGroupPrompt | null = null
  if (matched.guestId && matched.guest) {
    smallGroupPrompt = guestSmallGroupPrompt(matched.guestId, matched.guest)
  } else if (matched.memberId && matched.member) {
    smallGroupPrompt = memberSmallGroupPrompt(matched.memberId, matched.member)
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
    smallGroupPrompt,
  }
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
    const matchedRegistrants = (await findEventRegistrantsForLookup([eventId])).filter((r) =>
      matchesContactQuery(registrantContact(r), q)
    )

    // Event volunteers are matched on their linked member's phone/email and recorded
    // with the same attendance machinery.
    const matchedVolunteers = (await findEventVolunteersForLookup([eventId])).filter((v) =>
      matchesContactQuery({ email: v.member.email, phone: v.member.phone }, q)
    )

    return {
      success: true,
      data: await finishCheckinLookup(matchedRegistrants, matchedVolunteers, occurrenceId),
    }
  } catch {
    return { success: false, error: "Lookup failed. Please try again." }
  }
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
    // A volunteer is a member first — serving at an event says nothing about
    // whether they're in a DGroup, so they get asked on the same terms.
    smallGroupPrompt: memberSmallGroupPrompt(v.memberId, v.member),
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
    const matchedRegistrants = (await findEventRegistrantsForLookup([eventId])).filter((r) => {
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
    const matchedVolunteers = (await findEventVolunteersForLookup([eventId])).filter(
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
  const nameContains = buildNameMatcher(query)
  if (!nameContains) return { success: true, data: [] }

  try {
    const allRegistrants = await findEventRegistrantsForLookup([eventId])
    const matchedRegistrants = allRegistrants.filter((r) => {
      const first = r.member?.firstName ?? r.guest?.firstName ?? r.firstName ?? ""
      const last = r.member?.lastName ?? r.guest?.lastName ?? r.lastName ?? ""
      return nameContains(first, last, [
        r.nickname,
        r.member?.nickname ?? null,
        r.guest?.nickname ?? null,
      ])
    })

    const allVolunteers = await findEventVolunteersForLookup([eventId])
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
  walkIn?: { occurrenceId: string | null },
  /** Review-screen edits (CCF-147) — forwarded to the primary's resolver. */
  touchedFields?: TouchedFields,
  /** Ownership proof for the primary; forwarded so their edits are honoured. */
  grant?: string | null
): Promise<
  RegistrationResult<{
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
    const issue = parsedHousehold.error.issues[0]
    // The form repeats every field once per household member, so an unqualified
    // "Please enter a 4-digit birth year…" leaves the person hunting for which
    // row it came from. Name the member when the issue points at one.
    const [scope, index] = issue?.path ?? []
    const member =
      scope === "members" && typeof index === "number" ? householdRaw.members?.[index] : undefined
    const who = [member?.firstName, member?.lastName].filter(Boolean).join(" ").trim()
    const message = issue?.message ?? "Invalid household details"
    return {
      success: false,
      error: who ? `${who}: ${message}` : message,
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

  // …and the same Required flags. Reported against the household as a whole
  // rather than per person: the sub-form is one screen, and naming which of
  // three children is missing a birth year is more precision than the message
  // can carry usefully.
  const missingHousehold = household.members.flatMap((m) =>
    missingRequiredFields(householdConfig, m, HOUSEHOLD_MEMBER_FIELD_KEYS)
  )
  if (missingHousehold.length > 0) {
    return {
      success: false,
      error: `Every household member needs: ${requiredFieldLabels(
        Array.from(new Set(missingHousehold))
      )}.`,
    }
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
    walkIn,
    touchedFields,
    grant
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
              nickname: true,
              gender: true,
              birthMonth: true,
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
        // Backfill only what's missing; never overwrite known data. Shared with
        // the check-in desk so both doors fill the same set — see
        // `lib/households/backfill.ts`.
        if (existingInFamily.guestId) {
          const fills = householdBackfill(existingInFamily.guest, person)
          if (Object.keys(fills).length > 0) {
            await db.guest.update({
              where: { id: existingInFamily.guestId },
              data: fills,
            })
          }
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

      // Same rule as the primary registrant: only a walk-in marks attendance.
      if (walkIn) {
        await checkInWalkInRegistrant(registrantId, walkIn.occurrenceId)
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
 * Gated on the Check-in context's Family section. Check-in is individual by
 * default: an event that hasn't opted in never learns a registrant has a
 * household, so nobody is asked who else came with them.
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
    const checkinConfig = await getEffectiveFormConfig(eventId, "CheckIn")
    if (!checkinConfig.sectionFamily) return { success: true, data: null }

    const registrant = await db.eventRegistrant.findFirst({
      where: { id: registrantId, eventId },
      select: { id: true, memberId: true, guestId: true },
    })
    if (!registrant) return { success: true, data: null }
    // No person FK — an anonymous registrant, or an orphan from a pre-cascade
    // member deletion. Neither has a household, and passing the null ref through
    // would filter on `guestId IS NULL`, matching every member-linked family link
    // in the database and offering a stranger's household for check-in.
    if (!registrant.memberId && !registrant.guestId) return { success: true, data: null }

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
 *
 * Gated on the Check-in context's Family section, same as the lookup that feeds
 * it: without Family check-in, one kiosk interaction only ever checks in the one
 * person standing at it.
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
    const checkinConfig = await getEffectiveFormConfig(eventId, "CheckIn")
    if (!checkinConfig.sectionFamily) {
      return { success: false, error: "This event checks people in individually." }
    }

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

  // Every household path at the door obeys the Check-in context's Family
  // section; this one is the only one that also creates family structure.
  const checkinConfig = await getEffectiveFormConfig(eventId, "CheckIn")
  if (!checkinConfig.sectionFamily) {
    return { success: false, error: "This event isn't collecting household details." }
  }
  const person = sanitizeHouseholdMember(checkinConfig, parsed.data)
  const missingPerson = missingRequiredFields(
    checkinConfig,
    person,
    HOUSEHOLD_MEMBER_FIELD_KEYS
  )
  if (missingPerson.length > 0) {
    return { success: false, error: requiredFieldsMessage(missingPerson) }
  }

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
    // Same guard as `lookupHouseholdForCheckin`, and it matters more here: this
    // path writes. Without it a registrant carrying no person FK would resolve
    // `guestId IS NULL` to an unrelated family and attach the new person to it.
    if (!subject.memberId && !subject.guestId) {
      return {
        success: false,
        error: "This registration isn't linked to a person, so it has no household.",
      }
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
        guest: {
          select: {
            firstName: true,
            lastName: true,
            nickname: true,
            gender: true,
            birthMonth: true,
            birthYear: true,
            ageRangeBucketId: true,
          },
        },
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
      // Fill-if-empty, same rule and same field set as the registration form's
      // household path — answers given at the check-in desk for someone already
      // on the family roster would otherwise be collected and dropped. The two
      // doors must agree: a profile shouldn't gain a birth year through the
      // registration form but lose it at the desk.
      if (match.guestId) {
        const fills = householdBackfill(match.guest, person)
        if (Object.keys(fills).length > 0) {
          await db.guest.update({ where: { id: match.guestId }, data: fills })
        }
      }
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

/**
 * "Yes, I'm interested" on the check-in DGroup prompt (CCF-101).
 *
 * Check-in had the same dead end registration did: the prompt collected a
 * matching profile and then dropped the intent, so nobody was told a person had
 * asked to be placed. Recorded at the moment they answer rather than when they
 * save the profile — the profile step is skippable, and the interest is real
 * either way.
 *
 * Public, like every other check-in action: the board runs unauthenticated at a
 * kiosk. It can only ever create a Pending request for a guest who is already a
 * registrant of this event, which is not a meaningful write primitive to expose.
 */
export async function recordSmallGroupInterestAtCheckin(
  eventId: string,
  person: CheckinPerson
): Promise<ActionResult> {
  try {
    if (!(await isCheckinSubject(eventId, person))) {
      return { success: false, error: "Not registered for this event." }
    }
    await createSeekerRequestFromRegistration(person, eventId)
    revalidatePath("/small-groups")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to record DGroup interest" }
  }
}

/**
 * Whether this person is actually attending this event.
 *
 * Every check-in write is public, so the event is the only thing scoping it: a
 * caller may write a profile or raise a request for someone in front of the
 * kiosk, and for nobody else. Members qualify as registrants or as volunteers —
 * a serving member checks in through the volunteer path and never has a
 * registrant row.
 */
async function isCheckinSubject(eventId: string, person: CheckinPerson): Promise<boolean> {
  const registrant = await db.eventRegistrant.findFirst({
    where: { eventId, ...person },
    select: { id: true },
  })
  if (registrant) return true
  if (!("memberId" in person)) return false
  const volunteer = await db.volunteer.findFirst({
    where: { eventId, memberId: person.memberId },
    select: { id: true },
  })
  return volunteer !== null
}

/**
 * The check-in DGroup prompt's profile step ("Tell us about yourself").
 *
 * A kiosk copy of `saveGuestMatchingProfile`/the member equivalent, gated on
 * event attendance instead of a session: the admin actions call `requireWrite()`,
 * which no unauthenticated kiosk can satisfy, so calling them from here failed
 * every save with "Not authenticated."
 *
 * Like the registration paths, it enforces the Check-in form config server-side.
 * It previously read no config at all, so a crafted POST could write a profile
 * field this event's check-in form never asks for.
 */
export async function saveCheckinMatchingProfile(
  eventId: string,
  person: CheckinPerson,
  raw: MatchingProfileInput
): Promise<ActionResult> {
  const parsed = matchingProfileSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  try {
    if (!(await isCheckinSubject(eventId, person))) {
      return { success: false, error: "Not registered for this event." }
    }

    // `omitDisabledFields`, not `sanitizeRegistrantPayload`: the profile writers
    // treat an explicit null as "clear this column", so nulling a disabled field
    // here would erase an answer the person gave somewhere else. Dropping the key
    // blocks the crafted POST and leaves stored data alone.
    const checkinConfig = await getEffectiveFormConfig(eventId, "CheckIn")
    const profile = omitDisabledFields(checkinConfig, parsed.data)
    const missing = missingRequiredFields(
      checkinConfig,
      profile,
      fieldsForContext("CheckIn")
    )
    if (missing.length > 0) {
      return { success: false, error: requiredFieldsMessage(missing) }
    }

    if ("guestId" in person) {
      await applyGuestMatchingProfile(person.guestId, profile)
      revalidatePath(`/guests/${person.guestId}`)
    } else {
      await applyMemberMatchingProfile(person.memberId, profile)
      revalidatePath(`/members/${person.memberId}`)
    }
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save profile" }
  }
}

/**
 * "I'm already in one" on the check-in DGroup prompt — records the group the
 * person names as self-reported, never as membership.
 *
 * The two record types store that answer in different places, which is why this
 * takes a `CheckinPerson` rather than a guest id:
 *
 *   - **Guest** → `claimedSmallGroupId`, a scratch column for exactly this.
 *   - **Member** → a *Pending* `SmallGroupMemberRequest` via
 *     `recordMemberGroupClaim`. `Member.smallGroupId` is real membership that
 *     only an admin may set, so the claim becomes a request for a leader or an
 *     admin to confirm — the same shape the member portal produces.
 *
 * This used to be guest-only on the grounds that a member had nowhere to put the
 * answer. They do now, and the kiosk was the last surface still dropping it.
 *
 * Public for the same reason as the other check-in writes, and scoped the same
 * way — see `isCheckinSubject`.
 */
export async function saveCheckinClaimedGroup(
  eventId: string,
  person: CheckinPerson,
  smallGroupId: string
): Promise<ActionResult> {
  try {
    if (!(await isCheckinSubject(eventId, person))) {
      return { success: false, error: "Not registered for this event." }
    }
    const group = await db.smallGroup.findUnique({
      where: { id: smallGroupId },
      select: { id: true, status: true },
    })
    if (!group) return { success: false, error: "DGroup not found" }
    // `searchMembersForLeaderLookup` doesn't filter `ledGroups` by status, so a
    // retired group really does reach this screen. Both record types are refused
    // here rather than only the member one: `recordMemberGroupClaim` already
    // declines an Inactive group (a Pending request against a dead group has
    // nobody to confirm it), and without this the guest branch would happily
    // store a claim the member branch silently dropped — the same answer to the
    // same question landing two different ways.
    if (group.status === "Inactive") {
      return { success: false, error: "That DGroup is no longer active." }
    }

    if ("memberId" in person) {
      const result = await recordMemberGroupClaim(
        person.memberId,
        { scope: "group", smallGroupId },
        "event check-in"
      )
      // "already-placed" and "already-requested" mean the answer is already on
      // file — nothing to do, and telling someone at a kiosk their correct answer
      // failed would be wrong. A no-op that isn't one of those two means the write
      // did not happen and the person is being told it did, so it surfaces.
      if (!result.recorded && result.reason !== "already-placed" && result.reason !== "already-requested") {
        return { success: false, error: "Failed to save DGroup" }
      }
      revalidatePath(`/members/${person.memberId}`)
      revalidatePath("/small-groups")
      revalidatePath(`/small-groups/${smallGroupId}`)
      return { success: true, data: undefined }
    }

    await db.guest.update({
      where: { id: person.guestId },
      // Naming one of our groups supersedes an earlier "my DGroup is at another
      // satellite" answer — the two can't both be true.
      data: { claimedSmallGroupId: smallGroupId, claimedSatellite: null },
    })
    revalidatePath(`/guests/${person.guestId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save DGroup" }
  }
}
