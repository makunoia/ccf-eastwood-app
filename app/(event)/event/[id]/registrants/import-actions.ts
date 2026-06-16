"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite, canImport } from "@/lib/permissions"
import { enrichArray, enrichNullable, enrichText } from "@/lib/import/enrich"
import type { DuplicateMatch, ImportResult, RowResolution } from "@/lib/import/types"
import { Gender, Prisma } from "@/app/generated/prisma/client"
import { toTitleCase, formatPhilippinePhone } from "@/lib/utils"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

async function requireWrite(): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canWrite(session, "Events")) return { error: "Unauthorized." }
  return null
}

async function requireImport(): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canImport(session, "Events")) return { error: "Unauthorized." }
  return null
}

// ─── Duplicate check ──────────────────────────────────────────────────────────

export async function checkRegistrantDuplicates(
  eventId: string,
  rows: { email?: string; phone?: string }[]
): Promise<ActionResult<DuplicateMatch[]>> {
  try {
    const emails  = rows.map((r) => r.email).filter(Boolean) as string[]
    const phones  = rows
      .map((r) => (r.phone ? formatPhilippinePhone(r.phone) : undefined))
      .filter(Boolean) as string[]

    const [members, guests] = await Promise.all([
      db.member.findMany({
        where: {
          OR: [
            emails.length > 0 ? { email: { in: emails } } : undefined,
            phones.length > 0 ? { phone: { in: phones } } : undefined,
          ].filter(Boolean) as Prisma.MemberWhereInput[],
        },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      }),
      db.guest.findMany({
        where: {
          memberId: null,
          OR: [
            emails.length > 0 ? { email: { in: emails } } : undefined,
            phones.length > 0 ? { phone: { in: phones } } : undefined,
          ].filter(Boolean) as Prisma.GuestWhereInput[],
        },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      }),
    ])

    const memberByEmail = new Map(members.filter((m) => m.email).map((m) => [m.email!, m]))
    const memberByPhone = new Map(members.filter((m) => m.phone).map((m) => [m.phone!, m]))
    const guestByEmail  = new Map(guests.filter((g) => g.email).map((g) => [g.email!, g]))
    const guestByPhone  = new Map(guests.filter((g) => g.phone).map((g) => [g.phone!, g]))

    const matches: DuplicateMatch[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const member =
        (row.email && memberByEmail.get(row.email)) ||
        (row.phone && memberByPhone.get(row.phone))
      if (member) {
        matches.push({
          rowIndex:      i,
          existingId:    member.id,
          existingType:  "member",
          existingName:  `${member.firstName} ${member.lastName}`,
          existingEmail: member.email,
          existingPhone: member.phone,
        })
        continue
      }
      const guest =
        (row.email && guestByEmail.get(row.email)) ||
        (row.phone && guestByPhone.get(row.phone))
      if (guest) {
        matches.push({
          rowIndex:      i,
          existingId:    guest.id,
          existingType:  "guest",
          existingName:  `${guest.firstName} ${guest.lastName}`,
          existingEmail: guest.email,
          existingPhone: guest.phone,
        })
      }
    }
    return { success: true, data: matches }
  } catch {
    return { success: false, error: "Failed to check duplicates" }
  }
}

// ─── Import ───────────────────────────────────────────────────────────────────

type ImportRow = {
  mapped: Record<string, string>
  resolution: RowResolution
  existingId?: string
  existingType?: "member" | "guest" | "small-group" | "breakout-group"
}

function parseGender(v: string): Gender | null {
  const normalized = v.toLowerCase().trim()
  if (normalized === "male" || normalized === "m") return Gender.Male
  if (normalized === "female" || normalized === "f") return Gender.Female
  return null
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
}

function parseMonth(v: string): number | null {
  const s = v.trim()
  if (!s) return null
  const num = parseInt(s, 10)
  if (!isNaN(num)) return num >= 1 && num <= 12 ? num : null
  return MONTH_MAP[s.toLowerCase()] ?? null
}

function parseBirthYear(v?: string): number | null {
  if (!v?.trim()) return null
  const year = parseInt(v, 10)
  return Number.isNaN(year) ? null : year
}

function buildGuestData(mapped: Record<string, string>, firstName: string, lastName: string) {
  return {
    firstName,
    lastName,
    email: mapped.email?.trim() || null,
    phone: mapped.mobileNumber ? formatPhilippinePhone(mapped.mobileNumber) : null,
    language: [] as string[],
    gender: mapped.gender ? parseGender(mapped.gender) : null,
    birthMonth: parseMonth(mapped.birthMonth ?? ""),
    birthYear: parseBirthYear(mapped.birthYear),
  }
}

function buildMemberData(mapped: Record<string, string>, firstName: string, lastName: string) {
  return {
    firstName,
    lastName,
    email: mapped.email?.trim() || null,
    phone: mapped.mobileNumber ? formatPhilippinePhone(mapped.mobileNumber) : null,
    gender: mapped.gender ? parseGender(mapped.gender) : null,
    birthMonth: parseMonth(mapped.birthMonth ?? ""),
    birthYear: parseBirthYear(mapped.birthYear),
  }
}

function enrichGuestData(
  existing: {
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
    language: string[]
    gender: Gender | null
    birthMonth: number | null
    birthYear: number | null
  },
  incoming: ReturnType<typeof buildGuestData>,
) {
  return {
    firstName: enrichText(existing.firstName, incoming.firstName) ?? existing.firstName,
    lastName: enrichText(existing.lastName, incoming.lastName) ?? existing.lastName,
    email: enrichText(existing.email, incoming.email),
    phone: enrichText(existing.phone, incoming.phone),
    language: enrichArray(existing.language, incoming.language),
    gender: enrichNullable(existing.gender, incoming.gender),
    birthMonth: enrichNullable(existing.birthMonth, incoming.birthMonth),
    birthYear: enrichNullable(existing.birthYear, incoming.birthYear),
  }
}

function enrichMemberData(
  existing: {
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
    gender: Gender | null
    birthMonth: number | null
    birthYear: number | null
  },
  incoming: ReturnType<typeof buildMemberData>,
) {
  return {
    firstName: enrichText(existing.firstName, incoming.firstName) ?? existing.firstName,
    lastName: enrichText(existing.lastName, incoming.lastName) ?? existing.lastName,
    email: enrichText(existing.email, incoming.email),
    phone: enrichText(existing.phone, incoming.phone),
    gender: enrichNullable(existing.gender, incoming.gender),
    birthMonth: enrichNullable(existing.birthMonth, incoming.birthMonth),
    birthYear: enrichNullable(existing.birthYear, incoming.birthYear),
  }
}

function buildRegistrantData(mapped: Record<string, string>, paymentReference: string | null) {
  return {
    nickname: mapped.nickname?.trim() || null,
    isPaid: Boolean(paymentReference),
    paymentReference,
  }
}

function enrichRegistrantData(
  existing: { nickname: string | null; isPaid: boolean; paymentReference: string | null },
  incoming: ReturnType<typeof buildRegistrantData>,
) {
  return {
    nickname: enrichText(existing.nickname, incoming.nickname),
    isPaid: existing.isPaid || incoming.isPaid,
    paymentReference: enrichText(existing.paymentReference, incoming.paymentReference),
  }
}

async function enrichGuestRecord(guestId: string, mapped: Record<string, string>, firstName: string, lastName: string) {
  const existing = await db.guest.findUnique({
    where: { id: guestId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      language: true,
      gender: true,
      birthMonth: true,
      birthYear: true,
    },
  })
  if (!existing) throw new Error("Existing guest not found")
  await db.guest.update({
    where: { id: guestId },
    data: enrichGuestData(existing, buildGuestData(mapped, firstName, lastName)),
  })
}

async function enrichMemberRecord(memberId: string, mapped: Record<string, string>, firstName: string, lastName: string) {
  const existing = await db.member.findUnique({
    where: { id: memberId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      gender: true,
      birthMonth: true,
      birthYear: true,
    },
  })
  if (!existing) throw new Error("Existing member not found")
  await db.member.update({
    where: { id: memberId },
    data: enrichMemberData(existing, buildMemberData(mapped, firstName, lastName)),
  })
}

async function upsertRegistrantLink(
  eventId: string,
  relation: { memberId: string | null; guestId: string | null },
  incoming: ReturnType<typeof buildRegistrantData>,
): Promise<"created" | "updated"> {
  const existingRegistrant = await db.eventRegistrant.findFirst({
    where: {
      eventId,
      ...(relation.memberId ? { memberId: relation.memberId } : { guestId: relation.guestId! }),
    },
    select: { id: true, nickname: true, isPaid: true, paymentReference: true },
  })

  if (existingRegistrant) {
    await db.eventRegistrant.update({
      where: { id: existingRegistrant.id },
      data: enrichRegistrantData(existingRegistrant, incoming),
    })
    return "updated"
  }

  await db.eventRegistrant.create({
    data: {
      eventId,
      ...relation,
      nickname: incoming.nickname,
      ...(incoming.paymentReference ? { isPaid: true, paymentReference: incoming.paymentReference } : {}),
    },
  })
  return "created"
}

export async function importEventRegistrants(
  eventId: string,
  rows: ImportRow[]
): Promise<ActionResult<ImportResult>> {
  const authError = await requireImport()
  if (authError) return { success: false, error: authError.error }

  const result: ImportResult = { total: rows.length, created: 0, linked: 0, updated: 0, skipped: 0, errors: [] }

  // Verify event exists
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, formIncludePayment: true },
  })
  if (!event) return { success: false, error: "Event not found" }

  for (let i = 0; i < rows.length; i++) {
    const { mapped, resolution, existingId, existingType } = rows[i]
    try {
      const firstName = mapped.firstName ? toTitleCase(mapped.firstName) : ""
      const lastName  = mapped.lastName  ? toTitleCase(mapped.lastName)  : ""
      const paymentReference = event.formIncludePayment
        ? mapped.paymentReference?.trim() || null
        : null
      const registrantData = buildRegistrantData(mapped, paymentReference)
      if (!firstName || !lastName) {
        result.errors.push({ row: i, message: "First name and last name are required" })
        result.skipped++
        continue
      }

      if (existingId && resolution === "use-existing") {
        if (existingType === "guest") {
          await enrichGuestRecord(existingId, mapped, firstName, lastName)
        } else if (existingType === "member") {
          await enrichMemberRecord(existingId, mapped, firstName, lastName)
        }
        const action = await upsertRegistrantLink(
          eventId,
          {
            memberId: existingType === "member" ? existingId : null,
            guestId: existingType === "guest" ? existingId : null,
          },
          registrantData,
        )
        if (action === "created") result.linked++
        else result.updated++
        continue
      }

      if (existingId && existingType === "guest" && resolution === "use-csv") {
        // Update existing Guest and link
        await db.guest.update({
          where: { id: existingId },
          data: buildGuestData(mapped, firstName, lastName),
        })
        await upsertRegistrantLink(eventId, { memberId: null, guestId: existingId }, registrantData)
        result.updated++
        continue
      }

      if (existingId && existingType === "member" && resolution === "use-csv") {
        // For members, update personal fields and link
        await db.member.update({
          where: { id: existingId },
          data: buildMemberData(mapped, firstName, lastName),
        })
        await upsertRegistrantLink(eventId, { memberId: existingId, guestId: null }, registrantData)
        result.updated++
        continue
      }

      // No existing match — but first check if a Member with this contact is already registered
      // (handles reimport after a member was linked on first import, or phone format mismatch)
      const email  = mapped.email?.trim() || null
      const mobile = mapped.mobileNumber ? formatPhilippinePhone(mapped.mobileNumber) : null
      const rawPhone = mapped.mobileNumber?.trim() || null

      if (email || mobile || rawPhone) {
        const phoneConditions = [
          mobile ? { phone: mobile } : undefined,
          rawPhone && rawPhone !== mobile ? { phone: rawPhone } : undefined,
        ].filter(Boolean) as Prisma.MemberWhereInput[]
        const matchedMember = await db.member.findFirst({
          where: {
            OR: [
              email ? { email } : undefined,
              ...phoneConditions,
            ].filter(Boolean) as Prisma.MemberWhereInput[],
          },
          select: { id: true },
        })
        if (matchedMember) {
          await enrichMemberRecord(matchedMember.id, mapped, firstName, lastName)
          const action = await upsertRegistrantLink(
            eventId,
            { memberId: matchedMember.id, guestId: null },
            registrantData,
          )
          if (action === "created") result.linked++
          else result.updated++
          continue
        }
      }

      let guest = await db.guest.findFirst({
        where: {
          memberId: null,
          OR: [
            email  ? { email }  : undefined,
            mobile ? { phone: mobile } : undefined,
          ].filter(Boolean) as Prisma.GuestWhereInput[],
        },
        select: { id: true },
      })
      if (!guest) {
        guest = await db.guest.create({
          data: buildGuestData(mapped, firstName, lastName),
          select: { id: true },
        })
        await upsertRegistrantLink(eventId, { memberId: null, guestId: guest.id }, registrantData)
        result.created++
        continue
      }
      await enrichGuestRecord(guest.id, mapped, firstName, lastName)
      const action = await upsertRegistrantLink(eventId, { memberId: null, guestId: guest.id }, registrantData)
      if (action === "created") result.linked++
      else result.updated++
    } catch (e) {
      const msg = e instanceof Prisma.PrismaClientKnownRequestError
        ? `DB error: ${e.message.split("\n").pop()}`
        : "Failed to save record"
      result.errors.push({ row: i, message: msg })
      result.skipped++
    }
  }

  revalidatePath(`/event/${eventId}/registrants`)
  return { success: true, data: result }
}

// ─── Delete registrant ───────────────────────────────────────────────────────

export async function deleteEventRegistrant(
  registrantId: string,
  eventId: string
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    await db.eventRegistrant.delete({ where: { id: registrantId } })
    revalidatePath(`/event/${eventId}/registrants`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete registrant" }
  }
}

// ─── Manual add registrant ────────────────────────────────────────────────────

type AddRegistrantInput = {
  firstName: string
  lastName: string
  email?: string
  mobileNumber?: string
  nickname?: string
}

export async function addEventRegistrant(
  eventId: string,
  input: AddRegistrantInput
): Promise<ActionResult<{ id: string }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const firstName = toTitleCase(input.firstName.trim())
    const lastName  = toTitleCase(input.lastName.trim())
    if (!firstName || !lastName)
      return { success: false, error: "First name and last name are required" }

    const email  = input.email?.trim() || null
    const mobile = input.mobileNumber ? formatPhilippinePhone(input.mobileNumber) : null
    const rawPhone = input.mobileNumber?.trim() || null

    // Look up existing member by phone/email
    const phoneConditions = [
      mobile ? { phone: mobile } : undefined,
      rawPhone && rawPhone !== mobile ? { phone: rawPhone } : undefined,
    ].filter(Boolean) as Prisma.MemberWhereInput[]
    const member = (email || mobile || rawPhone) ? await db.member.findFirst({
      where: {
        OR: [
          email ? { email } : undefined,
          ...phoneConditions,
        ].filter(Boolean) as Prisma.MemberWhereInput[],
      },
      select: { id: true },
    }) : null

    if (member) {
      const existing = await db.eventRegistrant.findFirst({
        where: { eventId, memberId: member.id },
        select: { id: true },
      })
      if (existing) return { success: false, error: "This member is already registered for this event" }
      const reg = await db.eventRegistrant.create({
        data: { eventId, memberId: member.id, nickname: input.nickname?.trim() || null },
        select: { id: true },
      })
      revalidatePath(`/event/${eventId}/registrants`)
      return { success: true, data: { id: reg.id } }
    }

    // No member — find or create Guest
    const guest = await db.guest.findFirst({
      where: {
        memberId: null,
        OR: [
          email  ? { email }  : undefined,
          mobile ? { phone: mobile } : undefined,
          rawPhone && rawPhone !== mobile ? { phone: rawPhone } : undefined,
        ].filter(Boolean) as Prisma.GuestWhereInput[],
      },
      select: { id: true },
    }) ?? await db.guest.create({
      data: { firstName, lastName, email, phone: mobile ?? rawPhone, language: [] },
      select: { id: true },
    })

    const existingReg = await db.eventRegistrant.findFirst({
      where: { eventId, guestId: guest.id },
      select: { id: true },
    })
    if (existingReg) return { success: false, error: "This person is already registered for this event" }

    const reg = await db.eventRegistrant.create({
      data: { eventId, guestId: guest.id, nickname: input.nickname?.trim() || null },
      select: { id: true },
    })
    revalidatePath(`/event/${eventId}/registrants`)
    return { success: true, data: { id: reg.id } }
  } catch {
    return { success: false, error: "Failed to add registrant" }
  }
}
