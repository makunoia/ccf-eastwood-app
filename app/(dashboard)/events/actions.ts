"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { eventSchema, type EventFormValues } from "@/lib/validations/event"

const registrantSchema = z.object({
  firstName: z.string().min(1, "First name is required").trim(),
  lastName: z.string().min(1, "Last name is required").trim(),
  nickname: z.string().nullish().transform((v) => (v === "" || v == null ? null : v.trim())),
  email: z.string().nullish().transform((v) => (v === "" || v == null ? null : v.trim())),
  mobileNumber: z.string().nullish().transform((v) => (v === "" || v == null ? null : v.trim())),
  // Birthday — used as fallback matching field when no mobile or email
  birthMonth: z.number().int().min(1).max(12).optional().nullable(),
  birthYear: z.number().int().min(1900).max(2100).optional().nullable(),
  // Optional matching fields — collected on recurring event registration forms
  lifeStageId: z.string().optional().nullable().transform((v) => v || null),
  gender: z.enum(["Male", "Female"]).optional().nullable(),
  language: z.array(z.string()).optional().default([]),
  meetingPreference: z.enum(["Online", "Hybrid", "InPerson"]).optional().nullable(),
  workCity: z.string().optional().nullable().transform((v) => v || null),
  scheduleDayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  scheduleTimeStart: z.string().optional().nullable().transform((v) => v || null),
})

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createEvent(
  raw: EventFormValues
): Promise<ActionResult<{ id: string }>> {
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
  const parsed = eventSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  try {
    await db.$transaction([
      db.eventMinistry.deleteMany({ where: { eventId: id } }),
      db.event.update({
        where: { id },
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
      }),
    ])
    revalidatePath("/events")
    revalidatePath(`/events/${id}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update event" }
  }
}

export async function deleteEvent(id: string): Promise<ActionResult> {
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
}): Promise<MemberLookupResult | null> {
  const select = { id: true, firstName: true, lastName: true, email: true, phone: true }

  if (params.mobileNumber) {
    const member = await db.member.findFirst({
      where: { phone: params.mobileNumber.trim() },
      select,
    })
    if (member) return { ...member, matchedBy: "mobile", recordType: "member" }
  }

  if (params.email) {
    const member = await db.member.findFirst({
      where: { email: params.email.trim() },
      select,
    })
    if (member) return { ...member, matchedBy: "email", recordType: "member" }
  }

  if (params.lastName && params.birthMonth != null && params.birthYear != null) {
    const member = await db.member.findFirst({
      where: {
        lastName: { equals: params.lastName.trim(), mode: "insensitive" },
        birthMonth: params.birthMonth,
        birthYear: params.birthYear,
      },
      select,
    })
    if (member) return { ...member, matchedBy: "nameBirthday", recordType: "member" }
  }

  // No Member found — fall back to Guest records (only active guests, not yet promoted to members)
  if (params.mobileNumber) {
    const guest = await db.guest.findFirst({
      where: { phone: params.mobileNumber.trim(), memberId: null },
      select,
    })
    if (guest) return { ...guest, matchedBy: "mobile", recordType: "guest" }
  }

  if (params.email) {
    const guest = await db.guest.findFirst({
      where: { email: params.email.trim(), memberId: null },
      select,
    })
    if (guest) return { ...guest, matchedBy: "email", recordType: "guest" }
  }

  if (params.lastName && params.birthMonth != null && params.birthYear != null) {
    const guest = await db.guest.findFirst({
      where: {
        lastName: { equals: params.lastName.trim(), mode: "insensitive" },
        birthMonth: params.birthMonth,
        birthYear: params.birthYear,
        memberId: null,
      },
      select,
    })
    if (guest) return { ...guest, matchedBy: "nameBirthday", recordType: "guest" }
  }

  return null
}

// Kept for backward compatibility — delegates to lookupMemberForRegistration
export async function lookupMemberByMobile(
  mobileNumber: string
): Promise<{ id: string; firstName: string; lastName: string; email: string | null; phone: string | null } | null> {
  const result = await lookupMemberForRegistration({ mobileNumber })
  if (!result) return null
  const { matchedBy: _, ...member } = result
  return member
}

export async function createRegistrant(
  eventId: string,
  raw: z.infer<typeof registrantSchema>,
  confirmedMemberId: string | null,
  confirmedGuestId?: string | null,
  skipDeduplication?: boolean
): Promise<ActionResult<{ id: string }>> {
  const parsed = registrantSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    if (confirmedMemberId) {
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
          data: { eventId, memberId: confirmedMemberId },
          select: { id: true },
        }),
        ...(Object.keys(memberUpdates).length > 0
          ? [db.member.update({ where: { id: confirmedMemberId }, data: memberUpdates })]
          : []),
      ])
      return { success: true, data: { id: registrant.id } }
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
          scheduleDayOfWeek: true, scheduleTimeStart: true,
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

      const [registrant] = await db.$transaction([
        db.eventRegistrant.create({
          data: { eventId, guestId: confirmedGuestId },
          select: { id: true },
        }),
        ...(Object.keys(guestUpdates).length > 0
          ? [db.guest.update({ where: { id: confirmedGuestId }, data: guestUpdates })]
          : []),
      ])
      return { success: true, data: { id: registrant.id } }
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
            }),
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
        },
        select: { id: true },
      })
      return { success: true, data: { id: registrant.id } }
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
  date: string // "YYYY-MM-DD" UTC
): Promise<ActionResult<{ id: string }>> {
  try {
    const dateValue = new Date(`${date}T00:00:00.000Z`)
    const existing = await db.eventOccurrence.findUnique({
      where: { eventId_date: { eventId, date: dateValue } },
      select: { id: true },
    })
    if (existing) {
      return { success: false, error: "A session already exists for this date" }
    }
    const occurrence = await db.eventOccurrence.create({
      data: { eventId, date: dateValue },
      select: { id: true },
    })
    revalidatePath(`/events/${eventId}`)
    return { success: true, data: { id: occurrence.id } }
  } catch {
    return { success: false, error: "Failed to create session" }
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

export async function lookupCheckinRegistrant(
  eventId: string,
  query: string,
  occurrenceId: string | null
): Promise<ActionResult<CheckinRegistrantResult | null>> {
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
            claimedSmallGroupId: true,
          },
        },
      },
    })

    const lq = q.toLowerCase()
    const qNorm = q.replace(/\s+/g, "")

    const matched = registrants.find((r) => {
      const email = r.member?.email ?? r.guest?.email ?? r.email ?? ""
      const phone = r.member?.phone ?? r.guest?.phone ?? r.mobileNumber ?? ""
      return (
        email.toLowerCase() === lq ||
        phone.replace(/\s+/g, "") === qNorm
      )
    })

    if (!matched) return { success: true, data: null }

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

    // Determine if we should prompt about small group interest.
    // Only for guests on occurrence-based events (recurring/multiday) with 2+ prior check-ins.
    let guestSmallGroupPrompt: GuestSmallGroupPrompt | null = null
    if (occurrenceId !== null && matched.guestId && matched.guest) {
      const g = matched.guest
      const profileIncomplete = !g.lifeStageId || !g.gender || !g.meetingPreference
      const noClaimedGroup = !g.claimedSmallGroupId
      if (profileIncomplete && noClaimedGroup) {
        const priorCheckInCount = await db.occurrenceAttendee.count({
          where: { registrantId: matched.id, occurrence: { eventId } },
        })
        if (priorCheckInCount >= 1) {
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
            },
          }
        }
      }
    }

    return {
      success: true,
      data: {
        registrantId: matched.id,
        name,
        nickname: matched.nickname,
        alreadyCheckedIn,
        guestSmallGroupPrompt,
      },
    }
  } catch {
    return { success: false, error: "Lookup failed. Please try again." }
  }
}

const walkInSchema = z.object({
  firstName: z.string().min(1, "First name is required").trim(),
  lastName: z.string().min(1, "Last name is required").trim(),
  nickname: z.string().optional().transform((v) => (!v?.trim() ? null : v.trim())),
  email: z.string().optional().transform((v) => (!v?.trim() ? null : v.trim())),
  mobileNumber: z.string().min(1, "Mobile number is required").trim(),
})

export async function walkInCheckin(
  eventId: string,
  raw: z.infer<typeof walkInSchema>,
  occurrenceId: string | null
): Promise<ActionResult<{ registrantId: string; name: string }>> {
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
          select: { id: true, firstName: true, lastName: true },
        })
        if (!existingGuest && parsed.data.email) {
          existingGuest = await tx.guest.findFirst({
            where: { email: parsed.data.email },
            select: { id: true, firstName: true, lastName: true },
          })
        }

        if (existingGuest) {
          guestId = existingGuest.id
          displayName = `${existingGuest.firstName} ${existingGuest.lastName}`.trim()
        } else {
          const newGuest = await tx.guest.create({
            data: {
              firstName: parsed.data.firstName,
              lastName: parsed.data.lastName,
              email: parsed.data.email ?? null,
              phone: parsed.data.mobileNumber,
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

    return { success: true, data: { registrantId, name } }
  } catch {
    return { success: false, error: "Failed to register. Please try again." }
  }
}
