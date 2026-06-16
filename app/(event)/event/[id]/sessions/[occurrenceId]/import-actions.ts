"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canImport } from "@/lib/permissions"
import { toTitleCase, formatPhilippinePhone } from "@/lib/utils"
import type { DuplicateMatch, ImportResult, RowResolution } from "@/lib/import/types"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

async function requireImport(): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canImport(session, "Events")) return { error: "Unauthorized." }
  return null
}

// ─── Duplicate check ──────────────────────────────────────────────────────────
// Two passes:
// Pass 1 — already has an OccurrenceAttendee for this occurrence → true duplicate
//           (no kind, existingId = registrantId → import skips the row)
// Pass 2 — person exists in the system as a Member/Guest but hasn't attended yet
//           (kind = "recognized", existingId = member/guest id → import links them)

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

    // ── Pass 1: already checked in to this session ────────────────────────────
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

    type PersonEntry = {
      id: string
      existingType: DuplicateMatch["existingType"]
      name: string
      email: string | null
      phone: string | null
    }
    const attendedByEmail = new Map<string, PersonEntry>()
    const attendedByPhone = new Map<string, PersonEntry>()

    for (const a of alreadyAttended) {
      const r = a.registrant
      const name =
        r.member ? `${r.member.firstName} ${r.member.lastName}` :
        r.guest  ? `${r.guest.firstName} ${r.guest.lastName}` :
        `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()
      const email = r.member?.email ?? r.guest?.email ?? r.email ?? null
      const phone = r.member?.phone ?? r.guest?.phone ?? r.mobileNumber ?? null
      const entry: PersonEntry = {
        id: r.id,
        existingType: r.member ? "member" : "guest",
        name,
        email,
        phone,
      }
      if (email) attendedByEmail.set(email.toLowerCase(), entry)
      setPhoneEntries(attendedByPhone, phone, entry)
    }

    const matches: DuplicateMatch[] = []
    const unmatchedIndices: number[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const phoneCandidates = buildPhoneCandidates(row.phone)
      const match =
        (row.email && attendedByEmail.get(row.email.toLowerCase())) ||
        phoneCandidates.map((candidate) => attendedByPhone.get(candidate)).find(Boolean)
      if (match) {
        matches.push({
          rowIndex:      i,
          existingId:    match.id,
          existingType:  match.existingType,
          existingName:  match.name,
          existingEmail: match.email,
          existingPhone: match.phone,
          // no kind = already checked in (true duplicate)
        })
      } else {
        unmatchedIndices.push(i)
      }
    }

    // ── Pass 2: find existing Members/Guests not yet in this session ──────────
    if (unmatchedIndices.length > 0) {
      const unmatchedRows = unmatchedIndices.map((i) => rows[i])
      const emails = unmatchedRows.map((r) => r.email).filter(Boolean) as string[]
      const allPhoneCandidates = Array.from(
        new Set(unmatchedRows.flatMap((r) => buildPhoneCandidates(r.phone)))
      )

      if (emails.length > 0 || allPhoneCandidates.length > 0) {
        const orConditions = [
          emails.length > 0             ? { email: { in: emails } }             : undefined,
          allPhoneCandidates.length > 0 ? { phone: { in: allPhoneCandidates } } : undefined,
        ].filter(Boolean) as Prisma.MemberWhereInput[]

        const [members, guests] = await Promise.all([
          db.member.findMany({
            where: { OR: orConditions },
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          }),
          db.guest.findMany({
            where: { memberId: null, OR: orConditions as Prisma.GuestWhereInput[] },
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          }),
        ])

        const membersByEmail = new Map<string, PersonEntry>()
        const membersByPhone = new Map<string, PersonEntry>()
        for (const m of members) {
          const entry: PersonEntry = {
            id: m.id,
            existingType: "member",
            name: `${m.firstName} ${m.lastName}`,
            email: m.email,
            phone: m.phone,
          }
          if (m.email) membersByEmail.set(m.email.toLowerCase(), entry)
          setPhoneEntries(membersByPhone, m.phone, entry)
        }

        const guestsByEmail = new Map<string, PersonEntry>()
        const guestsByPhone = new Map<string, PersonEntry>()
        for (const g of guests) {
          const entry: PersonEntry = {
            id: g.id,
            existingType: "guest",
            name: `${g.firstName} ${g.lastName}`,
            email: g.email,
            phone: g.phone,
          }
          if (g.email) guestsByEmail.set(g.email.toLowerCase(), entry)
          setPhoneEntries(guestsByPhone, g.phone, entry)
        }

        for (const i of unmatchedIndices) {
          const row = rows[i]
          const phoneCandidates = buildPhoneCandidates(row.phone)
          const memberMatch =
            (row.email && membersByEmail.get(row.email.toLowerCase())) ||
            phoneCandidates.map((c) => membersByPhone.get(c)).find(Boolean)
          if (memberMatch) {
            matches.push({
              rowIndex:      i,
              existingId:    memberMatch.id,
              existingType:  "member",
              existingName:  memberMatch.name,
              existingEmail: memberMatch.email,
              existingPhone: memberMatch.phone,
              kind: "recognized",
            })
            continue
          }
          const guestMatch =
            (row.email && guestsByEmail.get(row.email.toLowerCase())) ||
            phoneCandidates.map((c) => guestsByPhone.get(c)).find(Boolean)
          if (guestMatch) {
            matches.push({
              rowIndex:      i,
              existingId:    guestMatch.id,
              existingType:  "guest",
              existingName:  guestMatch.name,
              existingEmail: guestMatch.email,
              existingPhone: guestMatch.phone,
              kind: "recognized",
            })
          }
        }
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

function buildPhoneCandidates(value: string | null | undefined): string[] {
  const raw = value?.trim()
  if (!raw) return []

  const candidates = new Set<string>([raw, formatPhilippinePhone(raw)])
  const digits = raw.replace(/\D/g, "")

  let local: string | null = null
  if (digits.startsWith("9") && digits.length === 10) local = digits
  if (digits.startsWith("0") && digits.length === 11) local = digits.slice(1)
  if (digits.startsWith("63") && digits.length === 12) local = digits.slice(2)

  if (local) {
    candidates.add(local)
    candidates.add(`0${local}`)
    candidates.add(`63${local}`)
    candidates.add(`+63${local}`)
    candidates.add(`+63 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`)
  }

  return Array.from(candidates).filter(Boolean)
}

function setPhoneEntries<T>(map: Map<string, T>, phone: string | null | undefined, value: T) {
  for (const candidate of buildPhoneCandidates(phone)) {
    map.set(candidate, value)
  }
}

function findTimeInString(value: string): { hours: number; minutes: number; seconds: number } | null {
  const timeMatch = value.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?(?=$|\s)/i)
  if (!timeMatch) return null

  let hours = parseInt(timeMatch[1], 10)
  const minutes = parseInt(timeMatch[2], 10)
  const seconds = parseInt(timeMatch[3] ?? "0", 10)
  const meridiem = timeMatch[4]?.toUpperCase()

  if (minutes > 59 || seconds > 59) return null

  if (meridiem) {
    if (hours < 1 || hours > 12) return null
    if (meridiem === "PM" && hours < 12) hours += 12
    if (meridiem === "AM" && hours === 12) hours = 0
  } else if (hours > 23) {
    return null
  }

  return { hours, minutes, seconds }
}

function parseCheckedInAt(value: string | undefined, occurrenceDate: Date): Date {
  if (!value?.trim()) return occurrenceDate

  const time = findTimeInString(value.trim())
  if (time) {
    const d = new Date(occurrenceDate)
    d.setUTCHours(time.hours, time.minutes, time.seconds, 0)
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
  const authError = await requireImport()
  if (authError) return { success: false, error: authError.error }

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
      const rawPhone = mapped.mobileNumber?.trim() || null
      const mobile = rawPhone ? formatPhilippinePhone(rawPhone) : null
      const phoneCandidates = buildPhoneCandidates(rawPhone)
      const checkedInAt = parseCheckedInAt(mapped.checkedInAt, occurrenceDate)

      // ── Find existing EventRegistrant for this event ──────────────────────
      // Match by member phone/email first, then guest phone/email
      const phoneConditions = phoneCandidates.map((candidate) => ({ phone: candidate })) satisfies Prisma.MemberWhereInput[]

      const matchedMember = (email || phoneCandidates.length > 0) ? await db.member.findFirst({
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
      const guestPhoneConditions = phoneCandidates.map((candidate) => ({ phone: candidate })) satisfies Prisma.GuestWhereInput[]

      const matchedGuest = (email || phoneCandidates.length > 0) ? await db.guest.findFirst({
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
