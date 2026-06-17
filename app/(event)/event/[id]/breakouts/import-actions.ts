"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canImport } from "@/lib/permissions"
import type { DuplicateMatch, ImportResult, RowResolution } from "@/lib/import/types"
import { enrichArray, enrichNullable, enrichText } from "@/lib/import/enrich"
import { formatPhilippinePhone } from "@/lib/utils"
import { GenderFocus, MeetingFormat, Prisma } from "@/app/generated/prisma/client"

// Mobile numbers are stored canonical ("+63 XXX XXX XXXX"); normalize the CSV
// value the same way before matching so exact-match lookups line up.
function normalizeMobile(value?: string): string {
  const trimmed = value?.trim()
  return trimmed ? formatPhilippinePhone(trimmed) : ""
}

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

type BreakoutContext = {
  eventId: string
}

async function requireImport(): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canImport(session, "Events")) return { error: "Unauthorized." }
  return null
}

// ─── Duplicate check ──────────────────────────────────────────────────────────

export async function checkBreakoutDuplicates(
  context: BreakoutContext,
  rows: { name?: string }[]
): Promise<ActionResult<DuplicateMatch[]>> {
  try {
    if (!context.eventId) return { success: false, error: "An event context is required" }

    const names = rows.map((r) => r.name?.trim()).filter(Boolean) as string[]
    if (names.length === 0) return { success: true, data: [] }

    // Breakout names are only unique within an event, so scope the lookup.
    const groups = await db.breakoutGroup.findMany({
      where: { eventId: context.eventId, name: { in: names, mode: "insensitive" } },
      select: { id: true, name: true },
    })
    const byName = new Map(groups.map((g) => [g.name.toLowerCase(), g]))

    const matches: DuplicateMatch[] = []
    for (let i = 0; i < rows.length; i++) {
      const name = rows[i].name?.trim()
      if (!name) continue
      const match = byName.get(name.toLowerCase())
      if (match) {
        matches.push({
          rowIndex: i,
          existingId: match.id,
          existingType: "breakout-group",
          existingName: match.name,
          existingEmail: null,
          existingPhone: null,
        })
      }
    }
    return { success: true, data: matches }
  } catch {
    return { success: false, error: "Failed to check duplicates" }
  }
}

// ─── Parsers (shared shape with the small-group import) ───────────────────────

function parseGenderFocus(v: string): GenderFocus | null {
  const n = v.toLowerCase().trim()
  if (n === "male" || n === "m") return GenderFocus.Male
  if (n === "female" || n === "f") return GenderFocus.Female
  if (n === "mixed") return GenderFocus.Mixed
  return null
}

function parseMeetingFormat(v: string): MeetingFormat | null {
  const n = v.toLowerCase().trim()
  if (n === "online") return MeetingFormat.Online
  if (n === "hybrid") return MeetingFormat.Hybrid
  if (n === "inperson" || n === "in person" || n === "in-person" || n === "face to face") return MeetingFormat.InPerson
  return null
}

function parseIntField(v: string): number | null {
  const n = parseInt(v, 10)
  return isNaN(n) ? null : n
}

function parseDayOfWeek(v: string): number | null {
  const trimmed = v.trim()
  const num = parseInt(trimmed, 10)
  if (!isNaN(num) && num >= 0 && num <= 6) return num
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const lower = trimmed.toLowerCase()
  const idx = days.findIndex((d) => d.startsWith(lower))
  return idx >= 0 ? idx : null
}

function parseTime(v: string): string | null {
  // Accept 24-hour ("19:00") and 12-hour ("7:00 PM") — same canonicalization as
  // every other import path. Returns "HH:MM" 24-hour or null.
  const match = v.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i)
  if (!match) return null

  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const meridiem = match[3]?.toUpperCase()

  if (minutes > 59) return null

  if (meridiem) {
    if (hours < 1 || hours > 12) return null
    if (meridiem === "PM" && hours < 12) hours += 12
    if (meridiem === "AM" && hours === 12) hours = 0
  } else if (hours > 23) {
    return null
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function addTwoHours(time: string): string {
  const [h, m] = time.split(":").map(Number)
  const newH = Math.min(h + 2, 23)
  return `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

// ─── Import ───────────────────────────────────────────────────────────────────

type ImportRow = {
  mapped: Record<string, string>
  resolution: RowResolution
  existingId?: string
}

type BreakoutScalars = {
  name: string
  facilitatorId: string | null
  linkedSmallGroupId: string | null
  lifeStageId: string | null
  genderFocus: GenderFocus | null
  language: string[]
  ageRangeMin: number | null
  ageRangeMax: number | null
  meetingFormat: MeetingFormat | null
  locationCity: string | null
  memberLimit: number | null
}

export async function importBreakoutGroups(
  context: BreakoutContext,
  rows: ImportRow[]
): Promise<ActionResult<ImportResult>> {
  const authError = await requireImport()
  if (authError) return { success: false, error: authError.error }

  if (!context.eventId) {
    return { success: false, error: "An event context is required" }
  }

  try {
    const result: ImportResult = { total: rows.length, created: 0, linked: 0, updated: 0, skipped: 0, errors: [] }

    // ── Pre-flight batch reads — O(2) queries regardless of row count ──────────
    const facilitatorMobiles = [...new Set(rows.map((r) => normalizeMobile(r.mapped.facilitatorMobile)).filter(Boolean))] as string[]
    const lifeStageNames     = [...new Set(rows.map((r) => r.mapped.lifeStage?.trim()).filter(Boolean))]                   as string[]

    const [eventVolunteers, lifeStages] = await Promise.all([
      facilitatorMobiles.length > 0
        ? db.volunteer.findMany({
            where: { eventId: context.eventId, member: { is: { phone: { in: facilitatorMobiles } } } },
            // Confirmed first so a member with multiple volunteer records on the
            // event resolves to the same one the create/edit form would offer.
            orderBy: [{ status: "asc" }, { createdAt: "asc" }],
            select: { id: true, member: { select: { phone: true, ledGroups: { select: { id: true } } } } },
          })
        : [],
      lifeStageNames.length > 0 ? db.lifeStage.findMany({ where: { name: { in: lifeStageNames, mode: "insensitive" } }, select: { id: true, name: true } }) : [],
    ])

    // phone → matched facilitator volunteer. We also pre-compute the small group
    // to auto-link: only when the facilitator leads exactly one group (same rule
    // as the form's auto-link and the small-group import back-fill).
    const mobileToFacilitator = new Map<string, { volunteerId: string; linkedSmallGroupId: string | null }>()
    for (const v of eventVolunteers) {
      const phone = v.member?.phone
      if (!phone || mobileToFacilitator.has(phone)) continue
      mobileToFacilitator.set(phone, {
        volunteerId: v.id,
        linkedSmallGroupId: v.member!.ledGroups.length === 1 ? v.member!.ledGroups[0].id : null,
      })
    }

    const nameToLifeStageId = new Map(lifeStages.map((ls) => [ls.name.toLowerCase(), ls.id]))

    for (let i = 0; i < rows.length; i++) {
      const { mapped, resolution, existingId } = rows[i]
      try {
        const name = mapped.name?.trim()
        if (!name) {
          result.errors.push({ row: i, message: "Group name is required" })
          result.skipped++
          continue
        }

        // ── Facilitator (matched by mobile against an existing event volunteer) ─
        // The facilitator's small group is linked automatically — there is no
        // small-group column to import.
        let facilitatorId: string | null = null
        let linkedSmallGroupId: string | null = null
        const facilitatorMobile = normalizeMobile(mapped.facilitatorMobile)
        if (facilitatorMobile) {
          const match = mobileToFacilitator.get(facilitatorMobile)
          if (!match) {
            result.errors.push({ row: i, message: `No event volunteer found with mobile "${mapped.facilitatorMobile?.trim()}"` })
            result.skipped++
            continue
          }
          facilitatorId = match.volunteerId
          linkedSmallGroupId = match.linkedSmallGroupId
        }

        // ── Life stage (map lookup) ──────────────────────────────────────────
        const lifeStageId = mapped.lifeStage?.trim()
          ? (nameToLifeStageId.get(mapped.lifeStage.trim().toLowerCase()) ?? null)
          : null

        const data: BreakoutScalars = {
          name,
          facilitatorId,
          linkedSmallGroupId,
          lifeStageId,
          genderFocus:  mapped.genderFocus      ? parseGenderFocus(mapped.genderFocus)     : null,
          language:     mapped.language?.trim() ? [mapped.language.trim()]                 : [],
          ageRangeMin:  mapped.ageRangeMin      ? parseIntField(mapped.ageRangeMin)        : null,
          ageRangeMax:  mapped.ageRangeMax      ? parseIntField(mapped.ageRangeMax)        : null,
          meetingFormat: mapped.meetingFormat   ? parseMeetingFormat(mapped.meetingFormat) : null,
          locationCity: mapped.locationCity?.trim() || null,
          memberLimit:  mapped.memberLimit      ? parseIntField(mapped.memberLimit)        : null,
        }

        // ── Schedule (single slot, mirrors the breakout form) ────────────────
        const scheduleDay   = mapped.scheduleDayOfWeek ? parseDayOfWeek(mapped.scheduleDayOfWeek) : null
        const scheduleStart = mapped.scheduleTime      ? parseTime(mapped.scheduleTime)           : null
        const scheduleEnd   = mapped.scheduleTimeEnd   ? parseTime(mapped.scheduleTimeEnd)        : null
        const schedule =
          scheduleDay !== null && scheduleStart
            ? {
                dayOfWeek: scheduleDay,
                timeStart: scheduleStart,
                timeEnd: scheduleEnd ?? addTwoHours(scheduleStart),
              }
            : null

        // ── Update existing ──────────────────────────────────────────────────
        if (existingId) {
          const existing = await db.breakoutGroup.findUnique({
            where: { id: existingId },
            select: {
              eventId: true,
              name: true,
              facilitatorId: true,
              linkedSmallGroupId: true,
              lifeStageId: true,
              genderFocus: true,
              language: true,
              ageRangeMin: true,
              ageRangeMax: true,
              meetingFormat: true,
              locationCity: true,
              memberLimit: true,
              _count: { select: { schedules: true } },
            },
          })
          if (!existing || existing.eventId !== context.eventId) {
            result.errors.push({ row: i, message: "Existing breakout group not found" })
            result.skipped++
            continue
          }

          const payload =
            resolution === "use-existing"
              ? {
                  name: enrichText(existing.name, data.name) ?? existing.name,
                  facilitatorId: enrichNullable(existing.facilitatorId, data.facilitatorId),
                  linkedSmallGroupId: enrichNullable(existing.linkedSmallGroupId, data.linkedSmallGroupId),
                  lifeStageId: enrichNullable(existing.lifeStageId, data.lifeStageId),
                  genderFocus: enrichNullable(existing.genderFocus, data.genderFocus),
                  language: enrichArray(existing.language, data.language),
                  ageRangeMin: enrichNullable(existing.ageRangeMin, data.ageRangeMin),
                  ageRangeMax: enrichNullable(existing.ageRangeMax, data.ageRangeMax),
                  meetingFormat: enrichNullable(existing.meetingFormat, data.meetingFormat),
                  locationCity: enrichText(existing.locationCity, data.locationCity),
                  memberLimit: enrichNullable(existing.memberLimit, data.memberLimit),
                }
              : data

          // The small-group link is system-derived, not a CSV column — only ever
          // fill it in, never clear or overwrite an existing link (even on use-csv).
          const finalPayload = {
            ...payload,
            linkedSmallGroupId: enrichNullable(existing.linkedSmallGroupId, data.linkedSmallGroupId),
          }

          await db.breakoutGroup.update({ where: { id: existingId }, data: finalPayload })

          // Schedule: replace on re-import; only fill in when enriching an empty one.
          if (schedule && (resolution === "use-csv" || existing._count.schedules === 0)) {
            await db.breakoutGroupSchedule.deleteMany({ where: { breakoutGroupId: existingId } })
            await db.breakoutGroupSchedule.create({ data: { breakoutGroupId: existingId, ...schedule } })
          }

          result.updated++
          continue
        }

        // ── Create new ───────────────────────────────────────────────────────
        await db.breakoutGroup.create({
          data: {
            eventId: context.eventId,
            ...data,
            ...(schedule ? { schedules: { create: schedule } } : {}),
          },
        })
        result.created++
      } catch (e) {
        console.error(`[importBreakoutGroups] row ${i} failed:`, e)
        let msg = "Failed to save record"
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
          if (e.code === "P2002") msg = "Duplicate record"
          else if (e.code === "P2003") msg = "Foreign key constraint failed"
          else if (e.code === "P2025") msg = "Required related record not found"
          else msg = `DB error ${e.code}`
        } else if (e instanceof Error) {
          msg = e.message.split("\n")[0]
        }
        result.errors.push({ row: i, message: msg })
        result.skipped++
      }
    }

    revalidatePath(`/event/${context.eventId}/breakouts`)
    return { success: true, data: result }
  } catch {
    return { success: false, error: "Import failed unexpectedly" }
  }
}
