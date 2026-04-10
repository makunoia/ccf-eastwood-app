"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import type { DuplicateMatch, ImportResult, RowResolution } from "@/lib/import/types"
import { Gender, MeetingPreference, VolunteerStatus, Prisma } from "@/app/generated/prisma/client"
import { toTitleCase, formatPhilippinePhone } from "@/lib/utils"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// ─── Duplicate check (against Member table) ───────────────────────────────────

export async function checkVolunteerDuplicates(
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
          rowIndex:      i,
          existingId:    match.id,
          existingType:  "member",
          existingName:  `${match.firstName} ${match.lastName}`,
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

type VolunteerContext = {
  ministryId?: string
  eventId?: string
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

function parseVolunteerStatus(v: string): VolunteerStatus {
  const n = v.toLowerCase()
  if (n === "confirmed") return VolunteerStatus.Confirmed
  if (n === "rejected")  return VolunteerStatus.Rejected
  return VolunteerStatus.Pending
}

export async function importVolunteers(
  context: VolunteerContext,
  rows: ImportRow[]
): Promise<ActionResult<ImportResult>> {
  if (!context.ministryId && !context.eventId) {
    return { success: false, error: "A ministry or event context is required" }
  }

  const result: ImportResult = { total: rows.length, created: 0, linked: 0, updated: 0, skipped: 0, errors: [] }

  // Pre-load committees + roles for this context (resolve by name later)
  const committees = await db.volunteerCommittee.findMany({
    where: context.ministryId
      ? { ministryId: context.ministryId }
      : { eventId: context.eventId },
    include: { roles: { select: { id: true, name: true } } },
  })

  const committeeByName = new Map(
    committees.map((c) => [c.name.toLowerCase(), c])
  )

  for (let i = 0; i < rows.length; i++) {
    const { mapped, resolution, existingId } = rows[i]
    try {
      const firstName = mapped.firstName ? toTitleCase(mapped.firstName) : ""
      const lastName  = mapped.lastName  ? toTitleCase(mapped.lastName)  : ""

      if (!firstName || !lastName) {
        result.errors.push({ row: i, message: "First name and last name are required" })
        result.skipped++
        continue
      }

      // Resolve committee
      const committeeName = mapped.committeeName?.trim()
      if (!committeeName) {
        result.errors.push({ row: i, message: "Committee name is required" })
        result.skipped++
        continue
      }
      const committee = committeeByName.get(committeeName.toLowerCase())
      if (!committee) {
        result.errors.push({ row: i, message: `Committee not found: "${committeeName}"` })
        result.skipped++
        continue
      }

      // Resolve role
      const roleName = mapped.roleName?.trim()
      if (!roleName) {
        result.errors.push({ row: i, message: "Role name is required" })
        result.skipped++
        continue
      }
      const role = committee.roles.find((r) => r.name.toLowerCase() === roleName.toLowerCase())
      if (!role) {
        result.errors.push({ row: i, message: `Role not found: "${roleName}" in committee "${committeeName}"` })
        result.skipped++
        continue
      }

      // Resolve or create Member
      let memberId: string

      if (existingId && resolution === "use-existing") {
        memberId = existingId
      } else if (existingId && resolution === "use-csv") {
        // Update existing Member with CSV data
        await db.member.update({
          where: { id: existingId },
          data: {
            firstName,
            lastName,
            email:             mapped.email?.trim() || null,
            phone:             mapped.phone ? formatPhilippinePhone(mapped.phone) : null,
            gender:            mapped.gender ? parseGender(mapped.gender) : undefined,
            language:          mapped.language?.trim() || null,
            meetingPreference: mapped.meetingPreference ? parseMeetingPreference(mapped.meetingPreference) : undefined,
          },
        })
        memberId = existingId
      } else {
        // No match — create new Member
        const member = await db.member.create({
          data: {
            firstName,
            lastName,
            email:             mapped.email?.trim() || null,
            phone:             mapped.phone ? formatPhilippinePhone(mapped.phone) : null,
            dateJoined:        new Date(),
            gender:            mapped.gender ? parseGender(mapped.gender) : null,
            language:          mapped.language?.trim() || null,
            meetingPreference: mapped.meetingPreference ? parseMeetingPreference(mapped.meetingPreference) : null,
            notes:             mapped.notes?.trim() || null,
          },
          select: { id: true },
        })
        memberId = member.id
        result.created++
      }

      // Check if volunteer record already exists for this member + committee
      const alreadyVolunteer = await db.volunteer.findFirst({
        where: { memberId, committeeId: committee.id },
        select: { id: true },
      })
      if (alreadyVolunteer) {
        result.skipped++
        continue
      }

      // Create Volunteer record
      await db.volunteer.create({
        data: {
          memberId,
          ministryId:     context.ministryId ?? null,
          eventId:        context.eventId ?? null,
          committeeId:    committee.id,
          preferredRoleId:role.id,
          status:         mapped.status ? parseVolunteerStatus(mapped.status) : VolunteerStatus.Pending,
          notes:          mapped.notes?.trim() || null,
        },
      })

      if (existingId) {
        result.linked++
      }
      // If we just created a Member above, result.created was already incremented
      // If existingId was set (linked or updated), do NOT double-count
    } catch (e) {
      const msg = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
        ? "Duplicate record"
        : "Failed to save record"
      result.errors.push({ row: i, message: msg })
      result.skipped++
    }
  }

  if (context.ministryId) revalidatePath(`/ministries/${context.ministryId}`)
  if (context.eventId)    revalidatePath(`/event/${context.eventId}/volunteers`)
  revalidatePath("/volunteers")

  return { success: true, data: result }
}
