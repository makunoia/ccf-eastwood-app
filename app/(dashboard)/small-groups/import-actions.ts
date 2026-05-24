"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import type { DuplicateMatch, ImportResult, RowResolution, UnmatchedLeaderRow, LeaderResolution } from "@/lib/import/types"
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

// ─── Leader check ─────────────────────────────────────────────────────────────

export async function checkSmallGroupLeaders(
  rows: Array<{
    index: number
    groupName?: string
    leaderFirstName?: string
    leaderLastName?: string
    leaderEmail?: string
    leaderMobile?: string
  }>
): Promise<ActionResult<UnmatchedLeaderRow[]>> {
  try {
    // Collect all unique mobiles and emails — two queries total instead of one per row
    const mobiles = [...new Set(rows.map((r) => r.leaderMobile?.trim()).filter(Boolean))] as string[]
    const emails  = [...new Set(rows.map((r) => r.leaderEmail?.trim()).filter(Boolean))]  as string[]

    const [byPhone, byEmail] = await Promise.all([
      mobiles.length > 0
        ? db.member.findMany({ where: { phone: { in: mobiles, mode: "insensitive" } }, select: { phone: true } })
        : [],
      emails.length > 0
        ? db.member.findMany({ where: { email: { in: emails,  mode: "insensitive" } }, select: { email: true } })
        : [],
    ])

    const matchedPhones = new Set(byPhone.map((m) => m.phone!.toLowerCase()))
    const matchedEmails = new Set(byEmail.map((m) => m.email!.toLowerCase()))

    const unmatched: UnmatchedLeaderRow[] = []
    for (const row of rows) {
      const mobile = row.leaderMobile?.trim()
      const email  = row.leaderEmail?.trim()

      const found =
        (mobile && matchedPhones.has(mobile.toLowerCase())) ||
        (email  && matchedEmails.has(email.toLowerCase()))

      if (!found) {
        unmatched.push({
          rowIndex:        row.index,
          groupName:       row.groupName?.trim()       ?? "",
          leaderFirstName: row.leaderFirstName?.trim() ?? "",
          leaderLastName:  row.leaderLastName?.trim()  ?? "",
          leaderEmail:     email                       ?? "",
          leaderMobile:    mobile                      ?? "",
        })
      }
    }

    return { success: true, data: unmatched }
  } catch {
    return { success: false, error: "Failed to check leaders" }
  }
}

// ─── Member search (for leader resolution step) ───────────────────────────────

export async function loadMembersForLeaderSearch(): Promise<
  ActionResult<Array<{ id: string; firstName: string; lastName: string; phone: string | null; email: string | null }>>
> {
  try {
    const members = await db.member.findMany({
      select: { id: true, firstName: true, lastName: true, phone: true, email: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    })
    return { success: true, data: members }
  } catch {
    return { success: false, error: "Failed to load members" }
  }
}

// ─── Import ───────────────────────────────────────────────────────────────────

type ImportRow = {
  mapped: Record<string, string>
  resolution: RowResolution
  existingId?: string
  leaderId?: string
  createLeader?: LeaderResolution & { type: "create" }
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
  // Strip seconds if present (HH:MM:SS → HH:MM)
  const trimmed = v.trim().replace(/^(\d{1,2}:\d{2}):\d{2}$/, "$1")
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed
  if (/^\d{1}:\d{2}$/.test(trimmed)) return `0${trimmed}`
  return null
}

function addTwoHours(time: string): string {
  const [h, m] = time.split(":").map(Number)
  const newH = Math.min(h + 2, 23)
  return `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

export async function importSmallGroups(
  rows: ImportRow[]
): Promise<ActionResult<ImportResult>> {
  try {
  const result: ImportResult = { total: rows.length, created: 0, linked: 0, updated: 0, skipped: 0, errors: [] }

  // ── Pre-flight batch reads — O(5) queries regardless of row count ──────────
  const mobiles        = [...new Set(rows.map((r) => r.mapped.leaderMobile?.trim()).filter(Boolean))] as string[]
  const emails         = [...new Set(rows.map((r) => r.mapped.leaderEmail?.trim()).filter(Boolean))]  as string[]
  const parentNames    = [...new Set(rows.map((r) => r.mapped.parentGroupName?.trim()).filter(Boolean))] as string[]
  const lifeStageNames = [...new Set(rows.map((r) => r.mapped.lifeStage?.trim()).filter(Boolean))]    as string[]

  const [membersByPhone, membersByEmail, parentGroups, lifeStages] = await Promise.all([
    mobiles.length     > 0 ? db.member.findMany({ where: { phone: { in: mobiles,        mode: "insensitive" } }, select: { id: true, phone: true } }) : [],
    emails.length      > 0 ? db.member.findMany({ where: { email: { in: emails,         mode: "insensitive" } }, select: { id: true, email: true } }) : [],
    parentNames.length > 0 ? db.smallGroup.findMany({ where: { name: { in: parentNames, mode: "insensitive" } }, select: { id: true, name: true } }) : [],
    lifeStageNames.length > 0 ? db.lifeStage.findMany({ where: { name: { in: lifeStageNames, mode: "insensitive" } }, select: { id: true, name: true } }) : [],
  ])

  const phoneToMemberId    = new Map(membersByPhone.map((m) => [m.phone!.toLowerCase(), m.id]))
  const emailToMemberId    = new Map(membersByEmail.map((m) => [m.email!.toLowerCase(), m.id]))
  const nameToParentId     = new Map(parentGroups.map((g) => [g.name.toLowerCase(), g.id]))
  const nameToLifeStageId  = new Map(lifeStages.map((ls) => [ls.name.toLowerCase(), ls.id]))

  // Cache for members created during this run (same leader leading multiple groups)
  const createdLeaderCache = new Map<string, string>() // "mobile|email" → memberId

  for (let i = 0; i < rows.length; i++) {
    const { mapped, resolution, existingId, leaderId: preResolvedLeaderId, createLeader } = rows[i]
    try {
      // Auto-generate name from leader if the name cell is blank
      let groupName = mapped.name?.trim()
      if (!groupName) {
        const fn = mapped.leaderFirstName?.trim() || createLeader?.firstName.trim() || ""
        const ln = mapped.leaderLastName?.trim()  || createLeader?.lastName.trim()  || ""
        const leaderName = [fn, ln].filter(Boolean).join(" ")
        groupName = leaderName ? `${leaderName} Group` : ""
      }
      if (!groupName) {
        result.errors.push({ row: i, message: "Group name is required" })
        result.skipped++
        continue
      }

      if (existingId && resolution === "use-existing") {
        result.linked++
        continue
      }

      // ── Leader resolution (map lookup — no DB call for auto-resolved rows) ─
      let leaderId: string | null = preResolvedLeaderId ?? null

      if (!leaderId) {
        const mobile = mapped.leaderMobile?.trim()
        const email  = mapped.leaderEmail?.trim()
        leaderId =
          (mobile && phoneToMemberId.get(mobile.toLowerCase())) ||
          (email  && emailToMemberId.get(email.toLowerCase()))  ||
          null
      }

      if (!leaderId && createLeader) {
        const mobile   = createLeader.mobile?.trim()
        const email    = createLeader.email?.trim()
        const cacheKey = `${mobile ?? ""}|${email ?? ""}`

        // Check cache first (same leader created earlier in this run)
        if (createdLeaderCache.has(cacheKey)) {
          leaderId = createdLeaderCache.get(cacheKey)!
        } else {
          // Race-condition-safe final check before creating
          const existing =
            (mobile && phoneToMemberId.get(mobile.toLowerCase())) ||
            (email  && emailToMemberId.get(email.toLowerCase()))  ||
            null
          if (existing) {
            leaderId = existing
          } else {
            const newMember = await db.member.create({
              data: {
                firstName:  createLeader.firstName.trim(),
                lastName:   createLeader.lastName.trim(),
                email:      email  || null,
                phone:      mobile || null,
                language:   [],
                dateJoined: new Date(),
              },
              select: { id: true },
            })
            leaderId = newMember.id
            // Cache so subsequent rows with the same leader reuse the new record
            createdLeaderCache.set(cacheKey, newMember.id)
            if (mobile) phoneToMemberId.set(mobile.toLowerCase(), newMember.id)
            if (email)  emailToMemberId.set(email.toLowerCase(),  newMember.id)
          }
        }
      }

      if (!leaderId) {
        result.errors.push({ row: i, message: "Could not resolve leader — no leader linked or created" })
        result.skipped++
        continue
      }

      // ── Parent group (map lookup) ──────────────────────────────────────────
      let parentGroupId: string | null = null
      if (mapped.parentGroupName?.trim()) {
        parentGroupId = nameToParentId.get(mapped.parentGroupName.trim().toLowerCase()) ?? null
        if (!parentGroupId) {
          result.errors.push({ row: i, message: `No group found with name "${mapped.parentGroupName.trim()}"` })
          result.skipped++
          continue
        }
      }

      // ── Life stage (map lookup) ────────────────────────────────────────────
      const lifeStageId = mapped.lifeStage?.trim()
        ? (nameToLifeStageId.get(mapped.lifeStage.trim().toLowerCase()) ?? null)
        : null

      const data = {
        name:              groupName,
        leaderId,
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
        scheduleTimeEnd:   (() => {
          const end   = mapped.scheduleTimeEnd ? parseTime(mapped.scheduleTimeEnd) : null
          const start = mapped.scheduleTime    ? parseTime(mapped.scheduleTime)    : null
          return end ?? (start ? addTwoHours(start) : null)
        })(),
      }

      if (existingId && resolution === "use-csv") {
        await db.smallGroup.update({ where: { id: existingId }, data })
        result.updated++
        continue
      }

      await db.smallGroup.create({ data })
      result.created++
    } catch (e) {
      console.error(`[importSmallGroups] row ${i} failed:`, e)
      let msg = "Failed to save record"
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2002") msg = "Duplicate record"
        else if (e.code === "P2003") msg = `Foreign key constraint failed (${JSON.stringify(e.meta?.field_name ?? e.meta ?? "")})`
        else if (e.code === "P2025") msg = "Required related record not found"
        else msg = `DB error ${e.code}: ${e.meta ? JSON.stringify(e.meta) : e.message.split("\n")[0]}`
      } else if (e instanceof Error) {
        msg = e.message.split("\n")[0]
      }
      result.errors.push({ row: i, message: msg })
      result.skipped++
    }
  }

  revalidatePath("/small-groups")
  return { success: true, data: result }
  } catch {
    return { success: false, error: "Import failed unexpectedly" }
  }
}
