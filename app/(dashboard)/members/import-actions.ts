"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import type { DuplicateMatch, ImportResult, RowResolution } from "@/lib/import/types"
import { Gender, MeetingPreference, Prisma } from "@/app/generated/prisma/client"
import { toTitleCase, formatPhilippinePhone } from "@/lib/utils"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// ─── Duplicate check ──────────────────────────────────────────────────────────

export async function checkMemberDuplicates(
  rows: { email?: string; phone?: string }[]
): Promise<ActionResult<DuplicateMatch[]>> {
  try {
    const emails = rows.map((r) => r.email).filter(Boolean) as string[]
    const phones = rows
      .map((r) => (r.phone ? formatPhilippinePhone(r.phone) : undefined))
      .filter(Boolean) as string[]

    const members = await db.member.findMany({
      where: {
        OR: [
          emails.length > 0 ? { email: { in: emails } } : undefined,
          phones.length > 0 ? { phone: { in: phones } } : undefined,
        ].filter(Boolean) as Prisma.MemberWhereInput[],
      },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    })

    const byEmail = new Map(members.filter((m) => m.email).map((m) => [m.email!, m]))
    const byPhone = new Map(members.filter((m) => m.phone).map((m) => [m.phone!, m]))

    const matches: DuplicateMatch[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const match = (row.email && byEmail.get(row.email)) || (row.phone && byPhone.get(row.phone))
      if (match) {
        matches.push({
          rowIndex: i,
          existingId: match.id,
          existingType: "member",
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

function parseMeetingPreference(v: string): MeetingPreference | null {
  const n = v.toLowerCase()
  if (n === "online") return MeetingPreference.Online
  if (n === "hybrid") return MeetingPreference.Hybrid
  if (n === "inperson" || n === "in person" || n === "in-person") return MeetingPreference.InPerson
  return null
}

function parseDate(v: string): Date | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

function buildMemberData(mapped: Record<string, string>) {
  return {
    firstName:         mapped.firstName ? toTitleCase(mapped.firstName) : "",
    lastName:          mapped.lastName  ? toTitleCase(mapped.lastName)  : "",
    email:             mapped.email?.trim() || null,
    phone:             mapped.phone ? formatPhilippinePhone(mapped.phone) : null,
    address:           mapped.address?.trim() || null,
    dateJoined:        parseDate(mapped.dateJoined) ?? new Date(),
    notes:             mapped.notes?.trim() || null,
    gender:            mapped.gender ? parseGender(mapped.gender) : null,
    language:          mapped.language?.trim() || null,
    birthDate:         mapped.birthDate ? parseDate(mapped.birthDate) : null,
    workCity:          mapped.workCity?.trim() || null,
    workIndustry:      mapped.workIndustry?.trim() || null,
    meetingPreference: mapped.meetingPreference ? parseMeetingPreference(mapped.meetingPreference) : null,
  }
}

export async function importMembers(
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
        // Link only — no changes to the existing record
        result.linked++
        continue
      }

      if (existingId && resolution === "use-csv") {
        // Update the existing Member with CSV data
        const data = buildMemberData(mapped)
        await db.member.update({ where: { id: existingId }, data })
        result.updated++
        continue
      }

      // Create new member
      const data = buildMemberData(mapped)
      await db.member.create({ data })
      result.created++
    } catch (e) {
      const msg = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
        ? "Duplicate email"
        : "Failed to save record"
      result.errors.push({ row: i, message: msg })
      result.skipped++
    }
  }

  revalidatePath("/members")
  return { success: true, data: result }
}
