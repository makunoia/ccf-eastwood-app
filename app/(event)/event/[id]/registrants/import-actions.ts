"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import type { DuplicateMatch, ImportResult, RowResolution } from "@/lib/import/types"
import { Prisma } from "@/app/generated/prisma/client"
import { toTitleCase, formatPhilippinePhone } from "@/lib/utils"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

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
  existingType?: "member" | "guest" | "small-group"
}

function parseBool(v: string): boolean {
  const n = v.toLowerCase().trim()
  return n === "true" || n === "yes" || n === "1"
}

export async function importEventRegistrants(
  eventId: string,
  rows: ImportRow[]
): Promise<ActionResult<ImportResult>> {
  const result: ImportResult = { total: rows.length, created: 0, linked: 0, updated: 0, skipped: 0, errors: [] }

  // Verify event exists
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } })
  if (!event) return { success: false, error: "Event not found" }

  for (let i = 0; i < rows.length; i++) {
    const { mapped, resolution, existingId, existingType } = rows[i]
    try {
      const firstName = mapped.firstName ? toTitleCase(mapped.firstName) : ""
      const lastName  = mapped.lastName  ? toTitleCase(mapped.lastName)  : ""
      if (!firstName || !lastName) {
        result.errors.push({ row: i, message: "First name and last name are required" })
        result.skipped++
        continue
      }

      if (existingId && resolution === "use-existing") {
        // Link to existing Member or Guest — just create the EventRegistrant
        const alreadyExists = await db.eventRegistrant.findFirst({
          where: {
            eventId,
            OR: [
              existingType === "member" ? { memberId: existingId } : undefined,
              existingType === "guest"  ? { guestId:  existingId } : undefined,
            ].filter(Boolean) as Prisma.EventRegistrantWhereInput[],
          },
          select: { id: true },
        })
        if (alreadyExists) {
          result.skipped++
          continue
        }
        await db.eventRegistrant.create({
          data: {
            eventId,
            memberId:        existingType === "member" ? existingId : null,
            guestId:         existingType === "guest"  ? existingId : null,
            isPaid:          mapped.isPaid ? parseBool(mapped.isPaid) : false,
            paymentReference:mapped.paymentReference?.trim() || null,
          },
        })
        result.linked++
        continue
      }

      if (existingId && existingType === "guest" && resolution === "use-csv") {
        // Update existing Guest and link
        await db.guest.update({
          where: { id: existingId },
          data: {
            firstName,
            lastName,
            email: mapped.email?.trim() || null,
            phone: mapped.mobileNumber ? formatPhilippinePhone(mapped.mobileNumber) : null,
          },
        })
        const alreadyExists = await db.eventRegistrant.findFirst({
          where: { eventId, guestId: existingId },
          select: { id: true },
        })
        if (!alreadyExists) {
          await db.eventRegistrant.create({
            data: {
              eventId,
              guestId:         existingId,
              isPaid:          mapped.isPaid ? parseBool(mapped.isPaid) : false,
              paymentReference:mapped.paymentReference?.trim() || null,
            },
          })
        }
        result.updated++
        continue
      }

      if (existingId && existingType === "member" && resolution === "use-csv") {
        // For members, update personal fields and link
        await db.member.update({
          where: { id: existingId },
          data: {
            firstName,
            lastName,
            email: mapped.email?.trim() || null,
            phone: mapped.mobileNumber ? formatPhilippinePhone(mapped.mobileNumber) : null,
          },
        })
        const alreadyExists = await db.eventRegistrant.findFirst({
          where: { eventId, memberId: existingId },
          select: { id: true },
        })
        if (!alreadyExists) {
          await db.eventRegistrant.create({
            data: {
              eventId,
              memberId:        existingId,
              isPaid:          mapped.isPaid ? parseBool(mapped.isPaid) : false,
              paymentReference:mapped.paymentReference?.trim() || null,
            },
          })
        }
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
          const memberRegistrant = await db.eventRegistrant.findFirst({
            where: { eventId, memberId: matchedMember.id },
            select: { id: true },
          })
          if (memberRegistrant) {
            result.skipped++
            continue
          }
          // Member found but not yet registered — link them
          await db.eventRegistrant.create({
            data: {
              eventId,
              memberId:         matchedMember.id,
              isPaid:           mapped.isPaid ? parseBool(mapped.isPaid) : false,
              paymentReference: mapped.paymentReference?.trim() || null,
            },
          })
          result.linked++
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
          data: { firstName, lastName, email, phone: mobile, language: [] },
          select: { id: true },
        })
      }
      const alreadyExists = await db.eventRegistrant.findFirst({
        where: { eventId, guestId: guest.id },
        select: { id: true },
      })
      if (alreadyExists) {
        result.skipped++
        continue
      }
      await db.eventRegistrant.create({
        data: {
          eventId,
          guestId:         guest.id,
          nickname:        mapped.nickname?.trim() || null,
          isPaid:          mapped.isPaid ? parseBool(mapped.isPaid) : false,
          paymentReference:mapped.paymentReference?.trim() || null,
        },
      })
      result.created++
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
