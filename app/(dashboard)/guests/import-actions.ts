"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import type { DuplicateMatch, ImportResult, RowResolution } from "@/lib/import/types"
import { Gender, Prisma } from "@/app/generated/prisma/client"
import { toTitleCase, formatPhilippinePhone } from "@/lib/utils"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// ─── Duplicate check ──────────────────────────────────────────────────────────

export async function checkGuestDuplicates(
  rows: { email?: string; phone?: string }[]
): Promise<ActionResult<DuplicateMatch[]>> {
  try {
    const emails = rows.map((r) => r.email).filter(Boolean) as string[]
    const phones = rows
      .map((r) => (r.phone ? formatPhilippinePhone(r.phone) : undefined))
      .filter(Boolean) as string[]

    const conditions: Prisma.GuestWhereInput[] = []
    if (emails.length > 0) conditions.push({ email: { in: emails } })
    if (phones.length > 0) conditions.push({ phone: { in: phones } })

    if (conditions.length === 0) return { success: true, data: [] }

    const guests = await db.guest.findMany({
      where: {
        AND: [
          { memberId: null }, // active guests only
          { OR: conditions },
        ],
      },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    })

    const byEmail = new Map(guests.filter((g) => g.email).map((g) => [g.email!, g]))
    const byPhone = new Map(guests.filter((g) => g.phone).map((g) => [g.phone!, g]))

    const matches: DuplicateMatch[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const normalizedPhone = row.phone ? formatPhilippinePhone(row.phone) : undefined
      const match =
        (row.email && byEmail.get(row.email)) ||
        (normalizedPhone && byPhone.get(normalizedPhone))
      if (match) {
        matches.push({
          rowIndex: i,
          existingId: match.id,
          existingType: "guest",
          existingName: `${match.firstName} ${match.lastName}`,
          existingEmail: match.email,
          existingPhone: match.phone,
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
}

function parseGender(v: string): Gender | null {
  const n = v.toLowerCase()
  if (n === "male" || n === "m") return Gender.Male
  if (n === "female" || n === "f") return Gender.Female
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

function buildGuestData(mapped: Record<string, string>) {
  return {
    firstName:  mapped.firstName ? toTitleCase(mapped.firstName) : "",
    lastName:   mapped.lastName  ? toTitleCase(mapped.lastName)  : "",
    email:      mapped.email?.trim() || null,
    phone:      mapped.phone ? formatPhilippinePhone(mapped.phone) : null,
    notes:      mapped.notes?.trim() || null,
    language:   [] as string[],
    gender:     mapped.gender ? parseGender(mapped.gender) : null,
    birthMonth: parseMonth(mapped.birthMonth ?? ""),
    birthYear:  mapped.birthYear ? parseInt(mapped.birthYear, 10) || null : null,
  }
}

export async function importGuests(
  rows: ImportRow[]
): Promise<ActionResult<ImportResult>> {
  const result: ImportResult = { total: rows.length, created: 0, linked: 0, updated: 0, skipped: 0, errors: [] }

  for (let i = 0; i < rows.length; i++) {
    const { mapped, resolution, existingId } = rows[i]
    try {
      if (!mapped.firstName || !mapped.lastName) {
        result.errors.push({ row: i, message: "First name and last name are required" })
        result.skipped++
        continue
      }

      if (existingId && resolution === "use-existing") {
        result.linked++
        continue
      }

      if (existingId && resolution === "use-csv") {
        const data = buildGuestData(mapped)
        await db.guest.update({ where: { id: existingId }, data })
        result.updated++
        continue
      }

      const data = buildGuestData(mapped)
      await db.guest.create({ data })
      result.created++
    } catch (e) {
      const msg =
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
          ? "Duplicate record"
          : "Failed to save record"
      result.errors.push({ row: i, message: msg })
      result.skipped++
    }
  }

  revalidatePath("/guests")
  return { success: true, data: result }
}
