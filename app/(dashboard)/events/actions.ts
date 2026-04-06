"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { eventSchema, type EventFormValues } from "@/lib/validations/event"

const registrantSchema = z.object({
  firstName: z.string().min(1, "First name is required").trim(),
  lastName: z.string().min(1, "Last name is required").trim(),
  nickname: z.string().optional().transform((v) => (v === "" || v == null ? null : v.trim())),
  email: z.string().optional().transform((v) => (v === "" || v == null ? null : v.trim())),
  mobileNumber: z.string().min(1, "Mobile number is required").trim(),
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
        ministryId: parsed.data.ministryId,
        type: parsed.data.type,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate ?? parsed.data.startDate,
        price: parsed.data.type === "Recurring" ? null : (parsed.data.price ?? null),
        registrationStart: parsed.data.registrationStart ?? null,
        registrationEnd: parsed.data.registrationEnd ?? null,
        recurrenceDayOfWeek: parsed.data.type === "Recurring" ? parsed.data.recurrenceDayOfWeek : null,
        recurrenceFrequency: parsed.data.type === "Recurring" ? (parsed.data.recurrenceFrequency ?? null) : null,
        recurrenceEndDate: parsed.data.type === "Recurring" ? (parsed.data.recurrenceEndDate ?? null) : null,
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
    await db.event.update({
      where: { id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        ministryId: parsed.data.ministryId,
        type: parsed.data.type,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate ?? parsed.data.startDate,
        price: parsed.data.type === "Recurring" ? null : (parsed.data.price ?? null),
        registrationStart: parsed.data.registrationStart ?? null,
        registrationEnd: parsed.data.registrationEnd ?? null,
        recurrenceDayOfWeek: parsed.data.type === "Recurring" ? parsed.data.recurrenceDayOfWeek : null,
        recurrenceFrequency: parsed.data.type === "Recurring" ? (parsed.data.recurrenceFrequency ?? null) : null,
        recurrenceEndDate: parsed.data.type === "Recurring" ? (parsed.data.recurrenceEndDate ?? null) : null,
      },
    })
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

// Returns matched member info if found, null otherwise.
// Used by the public registration form for member resolution.
export async function lookupMemberByMobile(
  mobileNumber: string
): Promise<{ id: string; firstName: string; lastName: string; email: string | null; phone: string | null } | null> {
  const member = await db.member.findFirst({
    where: { phone: mobileNumber.trim() },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  })
  return member ?? null
}

export async function createRegistrant(
  eventId: string,
  raw: z.infer<typeof registrantSchema>,
  confirmedMemberId: string | null
): Promise<ActionResult<{ id: string }>> {
  const parsed = registrantSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    if (confirmedMemberId) {
      // Member confirmed — link to member, leave personal fields null
      const registrant = await db.eventRegistrant.create({
        data: { eventId, memberId: confirmedMemberId },
        select: { id: true },
      })
      return { success: true, data: { id: registrant.id } }
    } else {
      // Non-member — find or create Guest by phone, then link via guestId
      const existingGuest = await db.guest.findFirst({
        where: { phone: parsed.data.mobileNumber },
        select: { id: true },
      })
      const guestId = existingGuest
        ? existingGuest.id
        : (await db.guest.create({
            data: {
              firstName: parsed.data.firstName,
              lastName: parsed.data.lastName,
              email: parsed.data.email ?? null,
              phone: parsed.data.mobileNumber,
            },
            select: { id: true },
          })).id

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
