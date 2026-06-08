"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import {
  eventSchema,
  occurrenceFormSchema,
  occurrenceGroupingSchema,
  occurrenceSeriesSchema,
  type EventFormValues,
} from "@/lib/validations/event"
import { suggestBreakoutGroup } from "@/lib/breakout-suggestion"
import { fetchBreakoutCandidates } from "@/lib/breakout-suggestion-server"
import { tryCreateSmallGroupRequestFromBreakout } from "@/lib/create-small-group-request"
import {
  findMatchingSeries,
  normalizeUtcDate,
  rangesOverlap,
  seriesContainsDate,
} from "@/lib/events/occurrence-series"
import { formatPhilippinePhone } from "@/lib/utils"
import type { Gender, MeetingFormat } from "@/app/generated/prisma/client"

type AssignedBreakout =
  | {
      id: string
      name: string
      meetingFormat: MeetingFormat | null
      locationCity: string | null
      schedule: { dayOfWeek: number; timeStart: string; timeEnd: string | null } | null
    }
  | null

async function fetchAssignedBreakoutDetails(groupId: string): Promise<AssignedBreakout> {
  const group = await db.breakoutGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      meetingFormat: true,
      locationCity: true,
      schedules: {
        select: { dayOfWeek: true, timeStart: true, timeEnd: true },
        orderBy: { dayOfWeek: "asc" },
        take: 1,
      },
    },
  })
  if (!group) return null
  return {
    id: group.id,
    name: group.name,
    meetingFormat: group.meetingFormat,
    locationCity: group.locationCity,
    schedule: group.schedules[0] ?? null,
  }
}

/**
 * Assign a registrant to a breakout group based on:
 *  - explicit pick (selectedBreakoutGroupId) — wins if provided & valid & not full
 *  - else autoAssignBreakout on the event — runs the simple Gender/Age/Capacity matcher
 *  - else nothing
 * Best-effort: failures are swallowed and return null.
 */
async function assignBreakoutForRegistrant(
  registrantId: string,
  eventId: string,
  selectedBreakoutGroupId: string | null,
  profile: { gender: Gender | null; birthYear: number | null }
): Promise<AssignedBreakout> {
  try {
    let chosenGroupId: string | null = null

    if (selectedBreakoutGroupId) {
      const picked = await db.breakoutGroup.findUnique({
        where: { id: selectedBreakoutGroupId },
        select: {
          id: true,
          eventId: true,
          memberLimit: true,
          _count: { select: { members: true } },
        },
      })
      if (
        picked &&
        picked.eventId === eventId &&
        (picked.memberLimit == null || picked._count.members < picked.memberLimit)
      ) {
        chosenGroupId = picked.id
      }
    } else {
      const event = await db.event.findUnique({
        where: { id: eventId },
        select: { autoAssignBreakout: true },
      })
      if (event?.autoAssignBreakout) {
        const candidates = await fetchBreakoutCandidates(eventId, null, false)
        const best = suggestBreakoutGroup(candidates, profile)
        if (best) chosenGroupId = best.id
      }
    }

    if (!chosenGroupId) return null

    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: chosenGroupId, registrantId },
    })
    await tryCreateSmallGroupRequestFromBreakout(chosenGroupId, registrantId)
    revalidatePath(`/event/${eventId}/breakouts`)
    return fetchAssignedBreakoutDetails(chosenGroupId)
  } catch {
    return null
  }
}

const registrantSchema = z.object({
  firstName: z.string().min(1, "First name is required").trim(),
  lastName: z.string().min(1, "Last name is required").trim(),
  nickname: z.string().nullish().transform((v) => (v === "" || v == null ? null : v.trim())),
  email: z.string().nullish().transform((v) => (v === "" || v == null ? null : v.trim())),
  mobileNumber: z.string().nullish().transform((v) => (v === "" || v == null ? null : formatPhilippinePhone(v.trim()))),
  // Birthday — used as fallback matching field when no mobile or email
  birthMonth: z.number().int().min(1).max(12).optional().nullable(),
  birthYear: z.number().int().min(1900).max(2100).optional().nullable(),
  // Optional matching fields — collected when the event's Small Group registration module is enabled
  lifeStageId: z.string().optional().nullable().transform((v) => v || null),
  gender: z.enum(["Male", "Female"]).optional().nullable(),
  language: z.array(z.string()).optional().default([]),
  meetingPreference: z.enum(["Online", "Hybrid", "InPerson"]).optional().nullable(),
  workCity: z.string().optional().nullable().transform((v) => v || null),
  scheduleDayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  scheduleTimeStart: z.string().optional().nullable().transform((v) => v || null),
  scheduleTimeEnd: z.string().optional().nullable().transform((v) => v || null),
  claimedSmallGroupId: z.string().optional().nullable().transform((v) => v || null),
  // Optional dietary fields — collected when the Dietary registration module is enabled
  dietaryPreference: z
    .enum([
      "Vegetarian", "Vegan", "Halal", "Kosher",
      "GlutenFree", "DairyFree", "NutFree", "Pescatarian", "Other",
    ])
    .optional()
    .nullable(),
  dietaryOther: z.string().optional().nullable().transform((v) => v || null),
  // Optional payment reference — collected when the Payment registration module is enabled
  paymentReference: z.string().optional().nullable().transform((v) => v || null),
})

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

export async function createEvent(
  raw: EventFormValues
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

  try {
    const event = await db.event.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        type: parsed.data.type,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate ?? parsed.data.startDate,
        price: parsed.data.type === "Recurring" ? null : (parsed.data.price ?? null),
        registrationStart: parsed.data.type === "Recurring" ? null : (parsed.data.registrationStart ?? null),
        registrationEnd: parsed.data.type === "Recurring" ? null : (parsed.data.registrationEnd ?? null),
        recurrenceDayOfWeek: parsed.data.type === "Recurring" ? parsed.data.recurrenceDayOfWeek : null,
        recurrenceFrequency: parsed.data.type === "Recurring" ? (parsed.data.recurrenceFrequency ?? null) : null,
        recurrenceEndDate: parsed.data.type === "Recurring" ? (parsed.data.recurrenceEndDate ?? null) : null,
        ministries: parsed.data.ministryIds?.length
          ? { create: parsed.data.ministryIds.map((ministryId) => ({ ministryId })) }
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
          price: isRecurring ? null : (parsed.data.price ?? null),
          registrationStart: isRecurring ? null : (parsed.data.registrationStart ?? null),
          registrationEnd: isRecurring ? null : (parsed.data.registrationEnd ?? null),
          recurrenceDayOfWeek: isRecurring ? parsed.data.recurrenceDayOfWeek : null,
          recurrenceFrequency: isRecurring ? (parsed.data.recurrenceFrequency ?? null) : null,
          recurrenceEndDate: isRecurring ? (parsed.data.recurrenceEndDate ?? null) : null,
          ministries: parsed.data.ministryIds?.length
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

async function autoCheckinIfOpenRecurringSession(registrantId: string, eventId: string) {
  const openOccurrence = await db.eventOccurrence.findFirst({
    where: { eventId, isOpen: true, event: { type: "Recurring" } },
    select: { id: true },
  })
  if (!openOccurrence) return
  await db.occurrenceAttendee.create({
    data: { occurrenceId: openOccurrence.id, registrantId, checkedInAt: new Date() },
  })
}

export async function createRegistrant(
  eventId: string,
  raw: z.input<typeof registrantSchema>,
  confirmedMemberId: string | null,
  confirmedGuestId?: string | null,
  skipDeduplication?: boolean,
  selectedBreakoutGroupId?: string | null
): Promise<ActionResult<{ id: string; breakoutGroup: AssignedBreakout }>> {
  const parsed = registrantSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    if (confirmedMemberId) {
      // Volunteer guard — volunteers don't need to register as attendees
      const volunteerRecord = await db.volunteer.findFirst({
        where: { memberId: confirmedMemberId, eventId },
        select: { id: true },
      })
      if (volunteerRecord) {
        return { success: false, error: "You're serving as a volunteer at this event — you don't need to register as an attendee." }
      }

      // Duplicate check — member already registered for this event
      const alreadyRegistered = await db.eventRegistrant.findFirst({
        where: { eventId, memberId: confirmedMemberId },
        select: { id: true },
      })
      if (alreadyRegistered) {
        return { success: false, error: "You're already registered for this event." }
      }

      // Member confirmed — fetch existing record, then fill in only fields that are currently null
      const existing = await db.member.findUniqueOrThrow({
        where: { id: confirmedMemberId },
        select: {
          email: true, phone: true, birthMonth: true, birthYear: true,
          lifeStageId: true, gender: true, language: true, meetingPreference: true, workCity: true,
        },
      })
      const memberUpdates: Record<string, unknown> = {}
      if (!existing.email && parsed.data.email) memberUpdates.email = parsed.data.email
      if (!existing.phone && parsed.data.mobileNumber) memberUpdates.phone = parsed.data.mobileNumber
      if (existing.birthMonth == null && parsed.data.birthMonth != null) memberUpdates.birthMonth = parsed.data.birthMonth
      if (existing.birthYear == null && parsed.data.birthYear != null) memberUpdates.birthYear = parsed.data.birthYear
      if (!existing.lifeStageId && parsed.data.lifeStageId) memberUpdates.lifeStageId = parsed.data.lifeStageId
      if (!existing.gender && parsed.data.gender) memberUpdates.gender = parsed.data.gender
      if (!existing.language?.length && parsed.data.language?.length) memberUpdates.language = parsed.data.language
      if (!existing.meetingPreference && parsed.data.meetingPreference) memberUpdates.meetingPreference = parsed.data.meetingPreference
      if (!existing.workCity && parsed.data.workCity) memberUpdates.workCity = parsed.data.workCity

      const [registrant] = await db.$transaction([
        db.eventRegistrant.create({
          data: {
            eventId,
            memberId: confirmedMemberId,
            dietaryPreference: parsed.data.dietaryPreference ?? null,
            dietaryOther: parsed.data.dietaryOther,
            paymentReference: parsed.data.paymentReference,
          },
          select: { id: true },
        }),
        ...(Object.keys(memberUpdates).length > 0
          ? [db.member.update({ where: { id: confirmedMemberId }, data: memberUpdates })]
          : []),
      ])
      const breakoutGroup = await assignBreakoutForRegistrant(
        registrant.id,
        eventId,
        selectedBreakoutGroupId ?? null,
        {
          gender: (parsed.data.gender ?? existing.gender) as Gender | null,
          birthYear: parsed.data.birthYear ?? existing.birthYear,
        }
      )
      await autoCheckinIfOpenRecurringSession(registrant.id, eventId)
      return { success: true, data: { id: registrant.id, breakoutGroup } }
    } else if (confirmedGuestId) {
      // Duplicate check — guest already registered for this event
      const alreadyRegistered = await db.eventRegistrant.findFirst({
        where: { eventId, guestId: confirmedGuestId },
        select: { id: true },
      })
      if (alreadyRegistered) {
        return { success: false, error: "You're already registered for this event." }
      }

      // Guest confirmed — fetch existing record, then fill in only fields that are currently null
      const existing = await db.guest.findUniqueOrThrow({
        where: { id: confirmedGuestId },
        select: {
          email: true, phone: true, birthMonth: true, birthYear: true,
          lifeStageId: true, gender: true, language: true, meetingPreference: true, workCity: true,
          scheduleDayOfWeek: true, scheduleTimeStart: true, scheduleTimeEnd: true, claimedSmallGroupId: true,
        },
      })
      const guestUpdates: Record<string, unknown> = {}
      if (!existing.email && parsed.data.email) guestUpdates.email = parsed.data.email
      if (!existing.phone && parsed.data.mobileNumber) guestUpdates.phone = parsed.data.mobileNumber
      if (existing.birthMonth == null && parsed.data.birthMonth != null) guestUpdates.birthMonth = parsed.data.birthMonth
      if (existing.birthYear == null && parsed.data.birthYear != null) guestUpdates.birthYear = parsed.data.birthYear
      if (!existing.lifeStageId && parsed.data.lifeStageId) guestUpdates.lifeStageId = parsed.data.lifeStageId
      if (!existing.gender && parsed.data.gender) guestUpdates.gender = parsed.data.gender
      if (!existing.language?.length && parsed.data.language?.length) guestUpdates.language = parsed.data.language
      if (!existing.meetingPreference && parsed.data.meetingPreference) guestUpdates.meetingPreference = parsed.data.meetingPreference
      if (!existing.workCity && parsed.data.workCity) guestUpdates.workCity = parsed.data.workCity
      if (existing.scheduleDayOfWeek == null && parsed.data.scheduleDayOfWeek != null) guestUpdates.scheduleDayOfWeek = parsed.data.scheduleDayOfWeek
      if (!existing.scheduleTimeStart && parsed.data.scheduleTimeStart) guestUpdates.scheduleTimeStart = parsed.data.scheduleTimeStart
      if (!existing.scheduleTimeEnd && parsed.data.scheduleTimeEnd) guestUpdates.scheduleTimeEnd = parsed.data.scheduleTimeEnd
      if (!existing.claimedSmallGroupId && parsed.data.claimedSmallGroupId) guestUpdates.claimedSmallGroupId = parsed.data.claimedSmallGroupId

      const [registrant] = await db.$transaction([
        db.eventRegistrant.create({
          data: {
            eventId,
            guestId: confirmedGuestId,
            dietaryPreference: parsed.data.dietaryPreference ?? null,
            dietaryOther: parsed.data.dietaryOther,
            paymentReference: parsed.data.paymentReference,
          },
          select: { id: true },
        }),
        ...(Object.keys(guestUpdates).length > 0
          ? [db.guest.update({ where: { id: confirmedGuestId }, data: guestUpdates })]
          : []),
      ])
      const breakoutGroup = await assignBreakoutForRegistrant(
        registrant.id,
        eventId,
        selectedBreakoutGroupId ?? null,
        {
          gender: (parsed.data.gender ?? existing.gender) as Gender | null,
          birthYear: parsed.data.birthYear ?? existing.birthYear,
        }
      )
      await autoCheckinIfOpenRecurringSession(registrant.id, eventId)
      return { success: true, data: { id: registrant.id, breakoutGroup } }
    } else {
      // Non-member — find or create Guest by phone, then link via guestId
      const matchingProfile = {
        lifeStageId: parsed.data.lifeStageId ?? null,
        gender: parsed.data.gender ?? null,
        language: parsed.data.language?.length ? parsed.data.language : undefined,
        meetingPreference: parsed.data.meetingPreference ?? null,
        workCity: parsed.data.workCity ?? null,
        scheduleDayOfWeek: parsed.data.scheduleDayOfWeek ?? null,
        scheduleTimeStart: parsed.data.scheduleTimeStart ?? null,
        scheduleTimeEnd: parsed.data.scheduleTimeEnd ?? null,
        claimedSmallGroupId: parsed.data.claimedSmallGroupId ?? null,
      }

      // Deduplicate guests: try phone first, then email, then last name + birthday
      // Skip deduplication when user explicitly said "That's not me" to a guest match
      let existingGuest: { id: string } | null = null
      if (!skipDeduplication) {
        if (parsed.data.mobileNumber) {
          existingGuest = await db.guest.findFirst({
            where: { phone: parsed.data.mobileNumber },
            select: { id: true },
          })
        }
        if (!existingGuest && parsed.data.email) {
          existingGuest = await db.guest.findFirst({
            where: { email: parsed.data.email },
            select: { id: true },
          })
        }
        if (
          !existingGuest &&
          parsed.data.lastName &&
          parsed.data.birthMonth != null &&
          parsed.data.birthYear != null
        ) {
          existingGuest = await db.guest.findFirst({
            where: {
              lastName: { equals: parsed.data.lastName.trim(), mode: "insensitive" },
              birthMonth: parsed.data.birthMonth,
              birthYear: parsed.data.birthYear,
            },
            select: { id: true },
          })
        }
      }

      let guestId: string
      if (existingGuest) {
        guestId = existingGuest.id
        // Update matching profile with any newly provided data
        await db.guest.update({
          where: { id: guestId },
          data: {
            ...(parsed.data.birthMonth != null && { birthMonth: parsed.data.birthMonth }),
            ...(parsed.data.birthYear != null && { birthYear: parsed.data.birthYear }),
            ...(matchingProfile.lifeStageId !== null && { lifeStageId: matchingProfile.lifeStageId }),
            ...(matchingProfile.gender !== null && { gender: matchingProfile.gender }),
            ...(matchingProfile.language !== undefined && { language: matchingProfile.language }),
            ...(matchingProfile.meetingPreference !== null && { meetingPreference: matchingProfile.meetingPreference }),
            ...(matchingProfile.workCity !== null && { workCity: matchingProfile.workCity }),
            ...(matchingProfile.scheduleDayOfWeek !== null && {
              scheduleDayOfWeek: matchingProfile.scheduleDayOfWeek,
              scheduleTimeStart: matchingProfile.scheduleTimeStart,
              scheduleTimeEnd: matchingProfile.scheduleTimeEnd,
            }),
          ...(matchingProfile.claimedSmallGroupId !== null && { claimedSmallGroupId: matchingProfile.claimedSmallGroupId }),
          },
        })
      } else {
        const newGuest = await db.guest.create({
          data: {
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
            email: parsed.data.email ?? null,
            phone: parsed.data.mobileNumber,
            birthMonth: parsed.data.birthMonth ?? null,
            birthYear: parsed.data.birthYear ?? null,
            language: matchingProfile.language ?? [],
            lifeStageId: matchingProfile.lifeStageId,
            gender: matchingProfile.gender,
            meetingPreference: matchingProfile.meetingPreference,
            workCity: matchingProfile.workCity,
            scheduleDayOfWeek: matchingProfile.scheduleDayOfWeek,
            scheduleTimeStart: matchingProfile.scheduleTimeStart,
            scheduleTimeEnd: matchingProfile.scheduleTimeEnd,
            claimedSmallGroupId: matchingProfile.claimedSmallGroupId,
          },
          select: { id: true },
        })
        guestId = newGuest.id
      }

      // Duplicate check — guest already registered for this event
      const alreadyRegistered = await db.eventRegistrant.findFirst({
        where: { eventId, guestId },
        select: { id: true },
      })
      if (alreadyRegistered) {
        return { success: false, error: "You're already registered for this event." }
      }

      const registrant = await db.eventRegistrant.create({
        data: {
          eventId,
          guestId,
          nickname: parsed.data.nickname ?? null,
          dietaryPreference: parsed.data.dietaryPreference ?? null,
          dietaryOther: parsed.data.dietaryOther,
          paymentReference: parsed.data.paymentReference,
        },
        select: { id: true },
      })
      const breakoutGroup = await assignBreakoutForRegistrant(
        registrant.id,
        eventId,
        selectedBreakoutGroupId ?? null,
        {
          gender: (parsed.data.gender ?? null) as Gender | null,
          birthYear: parsed.data.birthYear ?? null,
        }
      )
      await autoCheckinIfOpenRecurringSession(registrant.id, eventId)
      return { success: true, data: { id: registrant.id, breakoutGroup } }
    }
  } catch {
    return { success: false, error: "Failed to register. Please try again." }
  }
}

export async function markCheckinAttendance(
  registrantId: string
): Promise<ActionResult> {
  try {
    await db.eventRegistrant.update({
      where: { id: registrantId },
      data: { attendedAt: new Date() },
    })
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to mark attendance" }
  }
}

export async function getCheckinRegistrants(eventId: string) {
  return db.eventRegistrant.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
    include: {
      member: {
        select: { id: true, firstName: true, lastName: true, phone: true },
      },
      guest: {
        select: { id: true, firstName: true, lastName: true, phone: true },
      },
    },
  })
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
  registrantId: string
): Promise<ActionResult> {
  try {
    await db.occurrenceAttendee.upsert({
      where: { occurrenceId_registrantId: { occurrenceId, registrantId } },
      create: { occurrenceId, registrantId },
      update: {},
    })
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
  }
}

type CheckinRegistrantResult = {
  registrantId: string
  name: string
  nickname: string | null
  alreadyCheckedIn: boolean
  // Set when this is a guest's 2nd+ occurrence check-in and their profile is incomplete
  guestSmallGroupPrompt: GuestSmallGroupPrompt | null
}

type CheckinAmbiguousResult = {
  matchType: "ambiguous"
  candidates: Array<{
    registrantId: string
    name: string
    nickname: string | null
    alreadyCheckedIn: boolean
    guestSmallGroupPrompt: GuestSmallGroupPrompt | null
  }>
}

export async function lookupCheckinRegistrant(
  eventId: string,
  query: string,
  occurrenceId: string | null
): Promise<ActionResult<CheckinRegistrantResult | CheckinAmbiguousResult | null>> {
  const q = query.trim()
  if (!q) return { success: true, data: null }

  try {
    const registrants = await db.eventRegistrant.findMany({
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
        member: { select: { firstName: true, lastName: true, email: true, phone: true } },
        guest: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            lifeStageId: true,
            gender: true,
            language: true,
            meetingPreference: true,
            workCity: true,
            scheduleDayOfWeek: true,
            scheduleTimeStart: true,
            scheduleTimeEnd: true,
            claimedSmallGroupId: true,
            groupRequests: { select: { status: true } },
          },
        },
      },
    })

    const lq = q.toLowerCase()
    const qNorm = q.replace(/\s+/g, "")

    const allMatched = registrants.filter((r) => {
      const email = r.member?.email ?? r.guest?.email ?? r.email ?? ""
      const phone = r.member?.phone ?? r.guest?.phone ?? r.mobileNumber ?? ""
      return (
        email.toLowerCase() === lq ||
        phone.replace(/\s+/g, "") === qNorm
      )
    })

    if (allMatched.length === 0) return { success: true, data: null }

    async function resolveRegistrant(matched: (typeof registrants)[number]) {
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
            },
          }
        }
      }

      return {
        registrantId: matched.id,
        name,
        nickname: matched.nickname,
        alreadyCheckedIn,
        guestSmallGroupPrompt,
      }
    }

    if (allMatched.length > 1) {
      const candidates = await Promise.all(allMatched.map(resolveRegistrant))
      return { success: true, data: { matchType: "ambiguous", candidates } }
    }

    const data = await resolveRegistrant(allMatched[0])
    return { success: true, data }
  } catch {
    return { success: false, error: "Lookup failed. Please try again." }
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
    const registrants = await db.eventRegistrant.findMany({
      where: { eventId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        nickname: true,
        attendedAt: true,
        guestId: true,
        member: {
          select: {
            firstName: true,
            lastName: true,
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
            claimedSmallGroupId: true,
            groupRequests: { select: { status: true } },
          },
        },
      },
    })

    const allMatched = registrants.filter((r) => {
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

    if (allMatched.length === 0) return { success: true, data: null }

    async function resolveRegistrant(matched: (typeof registrants)[number]) {
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
            },
          }
        }
      }

      return {
        registrantId: matched.id,
        name,
        nickname: matched.nickname,
        alreadyCheckedIn,
        guestSmallGroupPrompt,
      }
    }

    if (allMatched.length > 1) {
      const candidates = await Promise.all(allMatched.map(resolveRegistrant))
      return { success: true, data: { matchType: "ambiguous", candidates } }
    }

    const data = await resolveRegistrant(allMatched[0])
    return { success: true, data }
  } catch {
    return { success: false, error: "Lookup failed. Please try again." }
  }
}

const walkInSchema = z.object({
  firstName: z.string().min(1, "First name is required").trim(),
  lastName: z.string().min(1, "Last name is required").trim(),
  nickname: z.string().optional().nullable().transform((v) => (!v?.trim() ? null : v.trim())),
  email: z.string().optional().nullable().transform((v) => (!v?.trim() ? null : v.trim())),
  mobileNumber: z.string().min(1, "Mobile number is required").trim(),
  gender: z.enum(["Male", "Female"]).optional().nullable(),
  birthMonth: z.number().int().min(1).max(12).optional().nullable(),
  birthYear: z.number().int().min(1900).max(2100).optional().nullable(),
  paymentReference: z.string().optional().nullable().transform((v) => (!v?.trim() ? null : v.trim())),
})

export async function walkInCheckin(
  eventId: string,
  raw: z.infer<typeof walkInSchema>,
  occurrenceId: string | null,
  selectedBreakoutGroupId?: string | null
): Promise<ActionResult<{ registrantId: string; name: string; breakoutGroup: AssignedBreakout }>> {
  const parsed = walkInSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    // Member lookup can happen outside the transaction (read-only)
    const member = await db.member.findFirst({
      where: { phone: parsed.data.mobileNumber },
      select: { id: true, firstName: true, lastName: true },
    })

    const { registrantId, name } = await db.$transaction(async (tx) => {
      let memberId: string | null = null
      let guestId: string | null = null
      let displayName: string

      if (member) {
        memberId = member.id
        displayName = `${member.firstName} ${member.lastName}`.trim()
      } else {
        // Find existing Guest by phone, then by email as fallback
        let existingGuest = await tx.guest.findFirst({
          where: { phone: parsed.data.mobileNumber },
          select: { id: true, firstName: true, lastName: true, gender: true, birthMonth: true, birthYear: true },
        })
        if (!existingGuest && parsed.data.email) {
          existingGuest = await tx.guest.findFirst({
            where: { email: parsed.data.email },
            select: { id: true, firstName: true, lastName: true, gender: true, birthMonth: true, birthYear: true },
          })
        }

        if (existingGuest) {
          guestId = existingGuest.id
          displayName = `${existingGuest.firstName} ${existingGuest.lastName}`.trim()
          // Update matching fields only when not already set
          const guestUpdates: Record<string, unknown> = {}
          if (!existingGuest.gender && parsed.data.gender) guestUpdates.gender = parsed.data.gender
          if (existingGuest.birthMonth == null && parsed.data.birthMonth != null) guestUpdates.birthMonth = parsed.data.birthMonth
          if (existingGuest.birthYear == null && parsed.data.birthYear != null) guestUpdates.birthYear = parsed.data.birthYear
          if (Object.keys(guestUpdates).length > 0) {
            await tx.guest.update({ where: { id: guestId }, data: guestUpdates })
          }
        } else {
          const newGuest = await tx.guest.create({
            data: {
              firstName: parsed.data.firstName,
              lastName: parsed.data.lastName,
              email: parsed.data.email ?? null,
              phone: parsed.data.mobileNumber,
              gender: parsed.data.gender ?? null,
              birthMonth: parsed.data.birthMonth ?? null,
              birthYear: parsed.data.birthYear ?? null,
              language: [],
            },
            select: { id: true },
          })
          guestId = newGuest.id
          displayName = `${parsed.data.firstName} ${parsed.data.lastName}`.trim()
        }
      }

      // Find or create EventRegistrant
      const existingRegistrant = await tx.eventRegistrant.findFirst({
        where: memberId ? { eventId, memberId } : { eventId, guestId: guestId! },
        select: { id: true },
      })

      const regId = existingRegistrant
        ? existingRegistrant.id
        : (
            await tx.eventRegistrant.create({
              data: {
                eventId,
                ...(memberId ? { memberId } : { guestId: guestId! }),
                nickname: parsed.data.nickname ?? null,
                ...(parsed.data.paymentReference
                  ? { isPaid: true, paymentReference: parsed.data.paymentReference }
                  : {}),
              },
              select: { id: true },
            })
          ).id

      // Check in immediately
      if (occurrenceId !== null) {
        await tx.occurrenceAttendee.upsert({
          where: { occurrenceId_registrantId: { occurrenceId, registrantId: regId } },
          create: { occurrenceId, registrantId: regId },
          update: {},
        })
      } else {
        await tx.eventRegistrant.update({
          where: { id: regId },
          data: { attendedAt: new Date() },
        })
      }

      return { registrantId: regId, name: displayName }
    })

    const breakoutGroup = await assignBreakoutForRegistrant(
      registrantId,
      eventId,
      selectedBreakoutGroupId ?? null,
      {
        gender: parsed.data.gender ?? null,
        birthYear: parsed.data.birthYear ?? null,
      }
    )

    return { success: true, data: { registrantId, name, breakoutGroup } }
  } catch {
    return { success: false, error: "Failed to register. Please try again." }
  }
}
