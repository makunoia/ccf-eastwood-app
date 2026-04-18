"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import type { DuplicateMatch, ImportResult, RowResolution } from "@/lib/import/types"
import { GenderFocus, MeetingFormat, Prisma } from "@/app/generated/prisma/client"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// ─── Duplicate check ──────────────────────────────────────────────────────────

export async function checkSmallGroupDuplicates(
  rows: { name?: string }[]
): Promise<ActionResult<DuplicateMatch[]>> {
  try {
    const names = rows.map((r) => r.name?.trim()).filter(Boolean) as string[]
    if (names.length === 0) return { success: true, data: [] }

    const groups = await db.smallGroup.findMany({
      where: { name: { in: names, mode: "insensitive" } },
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
          existingType: "small-group",
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

// ─── Import ───────────────────────────────────────────────────────────────────

type ImportRow = {
  mapped: Record<string, string>
  resolution: RowResolution
  existingId?: string
}

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
  if (n === "inperson" || n === "in person" || n === "in-person") return MeetingFormat.InPerson
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
  const trimmed = v.trim()
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed
  if (/^\d{1}:\d{2}$/.test(trimmed)) return `0${trimmed}`
  return null
}

export async function importSmallGroups(
  rows: ImportRow[]
): Promise<ActionResult<ImportResult>> {
  const result: ImportResult = { total: rows.length, created: 0, linked: 0, updated: 0, skipped: 0, errors: [] }

  for (let i = 0; i < rows.length; i++) {
    const { mapped, resolution, existingId } = rows[i]
    try {
      if (!mapped.name?.trim()) {
        result.errors.push({ row: i, message: "Group name is required" })
        result.skipped++
        continue
      }

      if (existingId && resolution === "use-existing") {
        result.linked++
        continue
      }

      // Resolve leader by email (required)
      if (!mapped.leaderEmail?.trim()) {
        result.errors.push({ row: i, message: "Leader email is required" })
        result.skipped++
        continue
      }

      const leader = await db.member.findFirst({
        where: { email: { equals: mapped.leaderEmail.trim(), mode: "insensitive" } },
        select: { id: true },
      })
      if (!leader) {
        result.errors.push({ row: i, message: `No member found with email "${mapped.leaderEmail.trim()}"` })
        result.skipped++
        continue
      }

      // Resolve optional parent group by name
      let parentGroupId: string | null = null
      if (mapped.parentGroupName?.trim()) {
        const parent = await db.smallGroup.findFirst({
          where: { name: { equals: mapped.parentGroupName.trim(), mode: "insensitive" } },
          select: { id: true },
        })
        if (!parent) {
          result.errors.push({ row: i, message: `No group found with name "${mapped.parentGroupName.trim()}"` })
          result.skipped++
          continue
        }
        parentGroupId = parent.id
      }

      // Resolve optional life stage by name (soft — ignored if not found)
      let lifeStageId: string | null = null
      if (mapped.lifeStage?.trim()) {
        const ls = await db.lifeStage.findFirst({
          where: { name: { equals: mapped.lifeStage.trim(), mode: "insensitive" } },
          select: { id: true },
        })
        if (ls) lifeStageId = ls.id
      }

      const data = {
        name:              mapped.name.trim(),
        leaderId:          leader.id,
        parentGroupId,
        lifeStageId,
        genderFocus:       mapped.genderFocus      ? parseGenderFocus(mapped.genderFocus)        : null,
        language:          mapped.language?.trim() ? [mapped.language.trim()]                    : [],
        ageRangeMin:       mapped.ageRangeMin      ? parseIntField(mapped.ageRangeMin)           : null,
        ageRangeMax:       mapped.ageRangeMax      ? parseIntField(mapped.ageRangeMax)           : null,
        meetingFormat:     mapped.meetingFormat    ? parseMeetingFormat(mapped.meetingFormat)    : null,
        locationCity:      mapped.locationCity?.trim() || null,
        memberLimit:       mapped.memberLimit      ? parseIntField(mapped.memberLimit)           : null,
        scheduleDayOfWeek: mapped.scheduleDayOfWeek ? parseDayOfWeek(mapped.scheduleDayOfWeek)  : null,
        scheduleTimeStart: mapped.scheduleTime      ? parseTime(mapped.scheduleTime)            : null,
      }

      if (existingId && resolution === "use-csv") {
        await db.smallGroup.update({ where: { id: existingId }, data })
        result.updated++
        continue
      }

      await db.smallGroup.create({ data })
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

  revalidatePath("/small-groups")
  return { success: true, data: result }
}
