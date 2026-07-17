"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import type { DuplicateMatch, ImportResult, RowResolution, UnmatchedLeaderRow, LeaderResolution } from "@/lib/import/types"
import { enrichArray, enrichNullable, enrichText } from "@/lib/import/enrich"
import { formatPhilippinePhone } from "@/lib/utils"
import { GenderFocus, MeetingFormat, Prisma, SmallGroupType } from "@/app/generated/prisma/client"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

// Normalize a raw CSV mobile value to the canonical "+63 XXX XXX XXXX" stored
// format, returning "" when empty. Mirrors every other import path so leader
// lookups match existing members and newly-created leaders store a valid number.
function normalizeMobile(raw: string | undefined): string {
  const trimmed = raw?.trim()
  return trimmed ? formatPhilippinePhone(trimmed) : ""
}

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
    // Collect all unique mobiles and emails — two queries total instead of one per row.
    // Mobiles are normalized to the canonical "+63 XXX XXX XXXX" stored format so
    // they match how members are persisted everywhere else in the app.
    const mobiles = [...new Set(rows.map((r) => normalizeMobile(r.leaderMobile)).filter(Boolean))] as string[]
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
      const mobile = normalizeMobile(row.leaderMobile)
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

function parseGroupType(v: string): SmallGroupType | null {
  const n = v.toLowerCase().trim()
  if (n === "couples" || n === "couple") return SmallGroupType.Couples
  if (n === "regular") return SmallGroupType.Regular
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
  // Accept both 24-hour ("19:00", "19:00:00") and 12-hour ("7:00 PM", "7:00pm")
  // formats — times are displayed/entered in 12-hour am/pm throughout the app,
  // so hand-authored or spreadsheet-edited CSVs commonly use that form. Always
  // returns the canonical 24-hour "HH:MM" stored format.
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

function getCreatedLeaderCacheKey(
  firstName: string,
  lastName: string,
  mobile?: string,
  email?: string,
): string | null {
  const normalizedMobile = mobile?.trim().toLowerCase() || ""
  const normalizedEmail = email?.trim().toLowerCase() || ""
  if (normalizedMobile || normalizedEmail) {
    return `${normalizedMobile}|${normalizedEmail}`
  }

  const normalizedName = `${firstName.trim()} ${lastName.trim()}`.trim().toLowerCase()
  return normalizedName ? `n:${normalizedName}` : null
}

// A single CSV life-stage cell may list several stages, delimited by "," or ";".
function splitLifeStages(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function enrichSmallGroupData(
  existing: {
    name: string
    leaderId: string | null
    parentGroupId: string | null
    genderFocus: GenderFocus | null
    language: string[]
    ageRangeMin: number | null
    ageRangeMax: number | null
    meetingFormat: MeetingFormat | null
    locationCity: string | null
    memberLimit: number | null
    scheduleDayOfWeek: number | null
    scheduleTimeStart: string | null
    scheduleTimeEnd: string | null
  },
  incoming: {
    name: string
    leaderId: string | null
    parentGroupId: string | null
    genderFocus: GenderFocus | null
    language: string[]
    ageRangeMin: number | null
    ageRangeMax: number | null
    meetingFormat: MeetingFormat | null
    locationCity: string | null
    memberLimit: number | null
    scheduleDayOfWeek: number | null
    scheduleTimeStart: string | null
    scheduleTimeEnd: string | null
  },
) {
  return {
    name: enrichText(existing.name, incoming.name) ?? existing.name,
    leaderId: enrichNullable(existing.leaderId, incoming.leaderId),
    parentGroupId: enrichNullable(existing.parentGroupId, incoming.parentGroupId),
    genderFocus: enrichNullable(existing.genderFocus, incoming.genderFocus),
    language: enrichArray(existing.language, incoming.language),
    ageRangeMin: enrichNullable(existing.ageRangeMin, incoming.ageRangeMin),
    ageRangeMax: enrichNullable(existing.ageRangeMax, incoming.ageRangeMax),
    meetingFormat: enrichNullable(existing.meetingFormat, incoming.meetingFormat),
    locationCity: enrichText(existing.locationCity, incoming.locationCity),
    memberLimit: enrichNullable(existing.memberLimit, incoming.memberLimit),
    scheduleDayOfWeek: enrichNullable(existing.scheduleDayOfWeek, incoming.scheduleDayOfWeek),
    scheduleTimeStart: enrichText(existing.scheduleTimeStart, incoming.scheduleTimeStart),
    scheduleTimeEnd: enrichText(existing.scheduleTimeEnd, incoming.scheduleTimeEnd),
  }
}

export async function importSmallGroups(
  rows: ImportRow[]
): Promise<ActionResult<ImportResult>> {
  try {
  const result: ImportResult = { total: rows.length, created: 0, linked: 0, updated: 0, skipped: 0, errors: [] }

  // ── Pre-flight batch reads — O(5) queries regardless of row count ──────────
  const mobiles        = [...new Set(rows.map((r) => normalizeMobile(r.mapped.leaderMobile)).filter(Boolean))] as string[]
  const emails         = [...new Set(rows.map((r) => r.mapped.leaderEmail?.trim()).filter(Boolean))]  as string[]
  const parentNames    = [...new Set(rows.map((r) => r.mapped.parentGroupName?.trim()).filter(Boolean))] as string[]
  const lifeStageNames = [...new Set(rows.flatMap((r) => splitLifeStages(r.mapped.lifeStage)))]       as string[]

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
  const createdLeaderCache = new Map<string, string>()

  // Leaders whose small group was created/updated this run — used afterward to
  // back-fill breakout groups they facilitate that have no linked small group yet.
  const touchedLeaderIds = new Set<string>()

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

      // ── Leader resolution (map lookup — no DB call for auto-resolved rows) ─
      let leaderId: string | null = preResolvedLeaderId ?? null

      if (!leaderId) {
        const mobile = normalizeMobile(mapped.leaderMobile)
        const email  = mapped.leaderEmail?.trim()
        leaderId =
          (mobile && phoneToMemberId.get(mobile.toLowerCase())) ||
          (email  && emailToMemberId.get(email.toLowerCase()))  ||
          null
      }

      if (!leaderId && createLeader) {
        const mobile   = normalizeMobile(createLeader.mobile)
        const email    = createLeader.email?.trim()
        const cacheKey = getCreatedLeaderCacheKey(
          createLeader.firstName,
          createLeader.lastName,
          mobile,
          email,
        )

        // Check cache first (same leader created earlier in this run).
        if (cacheKey && createdLeaderCache.has(cacheKey)) {
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
            if (cacheKey) createdLeaderCache.set(cacheKey, newMember.id)
            if (mobile) phoneToMemberId.set(mobile.toLowerCase(), newMember.id)
            if (email)  emailToMemberId.set(email.toLowerCase(),  newMember.id)
          }
        }
      }

      // A null leaderId is allowed — the group is imported without a leader.

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

      // ── Life stages (map lookup — supports a delimited list) ───────────────
      const lifeStageIds = [...new Set(
        splitLifeStages(mapped.lifeStage)
          .map((name) => nameToLifeStageId.get(name.toLowerCase()))
          .filter((id): id is string => Boolean(id))
      )]

      // null = column blank or unparseable — never changes an existing group's type
      const csvGroupType = mapped.groupType ? parseGroupType(mapped.groupType) : null

      const data = {
        name:              groupName,
        leaderId,
        parentGroupId,
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

      if (existingId && resolution === "use-existing") {
        const existing = await db.smallGroup.findUnique({
          where: { id: existingId },
          select: {
            name: true,
            leaderId: true,
            parentGroupId: true,
            groupType: true,
            lifeStages: { select: { id: true } },
            genderFocus: true,
            language: true,
            ageRangeMin: true,
            ageRangeMax: true,
            meetingFormat: true,
            locationCity: true,
            memberLimit: true,
            scheduleDayOfWeek: true,
            scheduleTimeStart: true,
            scheduleTimeEnd: true,
          },
        })
        if (!existing) {
          result.errors.push({ row: i, message: "Existing group not found" })
          result.skipped++
          continue
        }
        const enriched = enrichSmallGroupData(existing, data)
        // Union existing + incoming life stages (enrich = add data, don't drop).
        const enrichedLifeStageIds = enrichArray(
          existing.lifeStages.map((ls) => ls.id),
          lifeStageIds
        )
        // Enrich = add data, never drop: a Couples group can never be downgraded
        // by re-import; a Regular group upgrades only when the CSV says Couples.
        const enrichedGroupType =
          existing.groupType === SmallGroupType.Couples || csvGroupType === SmallGroupType.Couples
            ? SmallGroupType.Couples
            : existing.groupType
        if (enrichedGroupType === SmallGroupType.Couples) {
          enriched.genderFocus = GenderFocus.Mixed
        }
        await db.smallGroup.update({
          where: { id: existingId },
          data: {
            ...enriched,
            groupType: enrichedGroupType,
            lifeStages: { set: enrichedLifeStageIds.map((id) => ({ id })) },
          },
        })
        if (enriched.leaderId) touchedLeaderIds.add(enriched.leaderId)
        result.updated++
        continue
      }

      if (existingId && resolution === "use-csv") {
        // CSV wins when the column is provided; a blank cell keeps the current type.
        const existingType = await db.smallGroup.findUnique({
          where: { id: existingId },
          select: { groupType: true },
        })
        const finalType = csvGroupType ?? existingType?.groupType ?? SmallGroupType.Regular
        await db.smallGroup.update({
          where: { id: existingId },
          data: {
            ...data,
            groupType: finalType,
            ...(finalType === SmallGroupType.Couples ? { genderFocus: GenderFocus.Mixed } : {}),
            lifeStages: { set: lifeStageIds.map((id) => ({ id })) },
          },
        })
        if (data.leaderId) touchedLeaderIds.add(data.leaderId)
        result.updated++
        continue
      }

      const createType = csvGroupType ?? SmallGroupType.Regular
      await db.smallGroup.create({
        data: {
          ...data,
          groupType: createType,
          ...(createType === SmallGroupType.Couples ? { genderFocus: GenderFocus.Mixed } : {}),
          lifeStages: { connect: lifeStageIds.map((id) => ({ id })) },
        },
      })
      if (data.leaderId) touchedLeaderIds.add(data.leaderId)
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

  await linkBreakoutGroupsForLeaders([...touchedLeaderIds])

  revalidatePath("/small-groups")
  return { success: true, data: result }
  } catch {
    return { success: false, error: "Import failed unexpectedly" }
  }
}

/**
 * After importing small groups, back-fill the `linkedSmallGroupId` of any
 * breakout group whose facilitator now leads exactly one small group and which
 * has no linked small group yet. Mirrors the form's auto-link behaviour
 * (`ledGroups.length === 1`) so a facilitator's small group imported *after*
 * the breakout group was created gets picked up automatically.
 */
async function linkBreakoutGroupsForLeaders(leaderIds: string[]): Promise<void> {
  if (leaderIds.length === 0) return

  const affectedEventIds = new Set<string>()

  for (const leaderId of leaderIds) {
    // Only auto-link when the leader leads a single small group — otherwise the
    // correct source group is ambiguous (same rule the create/edit form uses).
    const ledGroups = await db.smallGroup.findMany({
      where: { leaderId },
      select: { id: true },
    })
    if (ledGroups.length !== 1) continue
    const smallGroupId = ledGroups[0].id

    const breakouts = await db.breakoutGroup.findMany({
      where: {
        linkedSmallGroupId: null,
        facilitator: { is: { memberId: leaderId } },
      },
      select: { id: true, eventId: true },
    })
    if (breakouts.length === 0) continue

    await db.breakoutGroup.updateMany({
      where: { id: { in: breakouts.map((b) => b.id) } },
      data: { linkedSmallGroupId: smallGroupId },
    })
    for (const b of breakouts) affectedEventIds.add(b.eventId)
  }

  for (const eventId of affectedEventIds) {
    revalidatePath(`/event/${eventId}/breakouts`)
  }
}
