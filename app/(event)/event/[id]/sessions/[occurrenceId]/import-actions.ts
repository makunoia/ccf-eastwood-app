"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { Prisma } from "@/app/generated/prisma/client"
import { toTitleCase, formatPhilippinePhone } from "@/lib/utils"
import type { DuplicateMatch, ImportResult, RowResolution } from "@/lib/import/types"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// ─── Duplicate check ──────────────────────────────────────────────────────────
// For session attendance, "duplicate" = already has an OccurrenceAttendee for
// this occurrence. We surface this as a match so the preview step highlights them.

export async function checkSessionAttendanceDuplicates(
  occurrenceId: string,
  rows: { email?: string; phone?: string }[]
): Promise<ActionResult<DuplicateMatch[]>> {
  try {
    const occurrence = await db.eventOccurrence.findUnique({
      where: { id: occurrenceId },
      select: { eventId: true },
    })
    if (!occurrence) return { success: false, error: "Occurrence not found" }

    const emails = rows.map((r) => r.email).filter(Boolean) as string[]
    const phones = rows
      .map((r) => (r.phone ? formatPhilippinePhone(r.phone) : undefined))
      .filter(Boolean) as string[]

    // Find registrants for this event that already have attendance for this occurrence
    const alreadyAttended = await db.occurrenceAttendee.findMany({
      where: { occurrenceId },
      select: {
        registrant: {
          select: {
            id: true,
            member: { select: { firstName: true, lastName: true, email: true, phone: true } },
            guest:  { select: { firstName: true, lastName: true, email: true, phone: true } },
            firstName: true,
            lastName:  true,
            email:     true,
            mobileNumber: true,
          },
        },
      },
    })

    // Build lookup maps keyed by email/phone
    type AttendedEntry = {
      registrantId: string
      name: string
      email: string | null
      phone: string | null
    }
    const byEmail = new Map<string, AttendedEntry>()
    const byPhone = new Map<string, AttendedEntry>()

    for (const a of alreadyAttended) {
      const r = a.registrant
      const name =
        r.member ? `${r.member.firstName} ${r.member.lastName}` :
        r.guest  ? `${r.guest.firstName} ${r.guest.lastName}` :
        `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()
      const email = r.member?.email ?? r.guest?.email ?? r.email ?? null
      const phone = r.member?.phone ?? r.guest?.phone ?? r.mobileNumber ?? null

      const entry: AttendedEntry = { registrantId: r.id, name, email, phone }
      if (email) byEmail.set(email.toLowerCase(), entry)
      if (phone) byPhone.set(phone, entry)
    }

    const matches: DuplicateMatch[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const normalizedPhone = row.phone ? formatPhilippinePhone(row.phone) : undefined
      const match =
        (row.email && byEmail.get(row.email.toLowerCase())) ||
        (normalizedPhone && byPhone.get(normalizedPhone))
      if (match) {
        matches.push({
          rowIndex:      i,
          existingId:    match.registrantId,
          existingType:  "member", // placeholder — not used by attendance import logic
          existingName:  match.name,
          existingEmail: match.email,
          existingPhone: match.phone,
        })
      }
    }

    return { success: true, data: matches }
  } catch {
    return { success: false, error: "Failed to check for existing attendance" }
  }
}

// ─── Import ───────────────────────────────────────────────────────────────────

type ImportRow = {
  mapped: Record<string, string>
  resolution: RowResolution
  existingId?: string   // registrantId of already-attended person (from duplicate check)
}

function parseCheckedInAt(value: string | undefined, occurrenceDate: Date): Date {
  if (!value?.trim()) return occurrenceDate

  // Try time-only strings like "10:30", "10:30 AM", "14:30"
  const timeMatch = value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i)
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10)
    const minutes = parseInt(timeMatch[2], 10)
    const meridiem = timeMatch[3]?.toUpperCase()
    if (meridiem === "PM" && hours < 12) hours += 12
    if (meridiem === "AM" && hours === 12) hours = 0
    const d = new Date(occurrenceDate)
    d.setUTCHours(hours, minutes, 0, 0)
    return d
  }

  // Try full datetime
  const parsed = new Date(value)
  if (!isNaN(parsed.getTime())) return parsed

  return occurrenceDate
}

export async function importSessionAttendance(
  occurrenceId: string,
  rows: ImportRow[]
): Promise<ActionResult<ImportResult>> {
  const result: ImportResult = {
    total: rows.length,
    created: 0,
    linked: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  }

  const occurrence = await db.eventOccurrence.findUnique({
    where: { id: occurrenceId },
    select: { id: true, eventId: true, date: true },
  })
  if (!occurrence) return { success: false, error: "Occurrence not found" }

  const { eventId, date: occurrenceDate } = occurrence

  for (let i = 0; i < rows.length; i++) {
    const { mapped, existingId } = rows[i]
    try {
      const firstName = mapped.firstName ? toTitleCase(mapped.firstName) : ""
      const lastName  = mapped.lastName  ? toTitleCase(mapped.lastName)  : ""
      if (!firstName || !lastName) {
        result.errors.push({ row: i, message: "First name and last name are required" })
        result.skipped++
        continue
      }

      // Already attended (flagged by duplicate check) — skip
      if (existingId) {
        result.skipped++
        continue
      }

      const email  = mapped.email?.trim() || null
      const mobile = mapped.mobileNumber ? formatPhilippinePhone(mapped.mobileNumber) : null
      const checkedInAt = parseCheckedInAt(mapped.checkedInAt, occurrenceDate)

      // ── Find existing EventRegistrant for this event ──────────────────────
      // Match by member phone/email first, then guest phone/email
      const phoneConditions = mobile
        ? [{ phone: mobile }] as Prisma.MemberWhereInput[]
        : []

      const matchedMember = (email || mobile) ? await db.member.findFirst({
        where: {
          OR: [
            email  ? { email }  : undefined,
            ...phoneConditions,
          ].filter(Boolean) as Prisma.MemberWhereInput[],
        },
        select: { id: true },
      }) : null

      if (matchedMember) {
        const registrant = await db.eventRegistrant.findFirst({
          where: { eventId, memberId: matchedMember.id },
          select: { id: true },
        })

        if (registrant) {
          // Already registered — check for existing attendance
          const existing = await db.occurrenceAttendee.findUnique({
            where: { occurrenceId_registrantId: { occurrenceId, registrantId: registrant.id } },
            select: { id: true },
          })
          if (existing) {
            result.skipped++
            continue
          }
          await db.occurrenceAttendee.create({
            data: { occurrenceId, registrantId: registrant.id, checkedInAt },
          })
          result.linked++
          continue
        }

        // Member exists but not yet registered for this event — walk-in
        const newReg = await db.eventRegistrant.create({
          data: { eventId, memberId: matchedMember.id },
          select: { id: true },
        })
        await db.occurrenceAttendee.create({
          data: { occurrenceId, registrantId: newReg.id, checkedInAt },
        })
        result.linked++
        continue
      }

      // Try matching a Guest
      const guestPhoneConditions = mobile
        ? [{ phone: mobile }] as Prisma.GuestWhereInput[]
        : []

      const matchedGuest = (email || mobile) ? await db.guest.findFirst({
        where: {
          memberId: null,
          OR: [
            email  ? { email }  : undefined,
            ...guestPhoneConditions,
          ].filter(Boolean) as Prisma.GuestWhereInput[],
        },
        select: { id: true },
      }) : null

      if (matchedGuest) {
        const registrant = await db.eventRegistrant.findFirst({
          where: { eventId, guestId: matchedGuest.id },
          select: { id: true },
        })

        if (registrant) {
          const existing = await db.occurrenceAttendee.findUnique({
            where: { occurrenceId_registrantId: { occurrenceId, registrantId: registrant.id } },
            select: { id: true },
          })
          if (existing) {
            result.skipped++
            continue
          }
          await db.occurrenceAttendee.create({
            data: { occurrenceId, registrantId: registrant.id, checkedInAt },
          })
          result.linked++
          continue
        }

        // Guest exists but not registered for this event — walk-in
        const newReg = await db.eventRegistrant.create({
          data: { eventId, guestId: matchedGuest.id },
          select: { id: true },
        })
        await db.occurrenceAttendee.create({
          data: { occurrenceId, registrantId: newReg.id, checkedInAt },
        })
        result.linked++
        continue
      }

      // No existing Member or Guest — create new Guest walk-in
      const guest = await db.guest.create({
        data: { firstName, lastName, email, phone: mobile, language: [] },
        select: { id: true },
      })
      const reg = await db.eventRegistrant.create({
        data: { eventId, guestId: guest.id },
        select: { id: true },
      })
      await db.occurrenceAttendee.create({
        data: { occurrenceId, registrantId: reg.id, checkedInAt },
      })
      result.created++
    } catch (e) {
      const msg =
        e instanceof Prisma.PrismaClientKnownRequestError
          ? `DB error: ${e.message.split("\n").pop()}`
          : "Failed to save record"
      result.errors.push({ row: i, message: msg })
      result.skipped++
    }
  }

  revalidatePath(`/event/${occurrence.eventId}/sessions/${occurrenceId}`)
  return { success: true, data: result }
}
