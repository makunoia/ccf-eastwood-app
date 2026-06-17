"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canImport } from "@/lib/permissions"
import type { DuplicateMatch, ImportResult, RowResolution } from "@/lib/import/types"
import { enrichNullable, enrichText } from "@/lib/import/enrich"
import { formatPhilippinePhone } from "@/lib/utils"
import { Prisma } from "@/app/generated/prisma/client"

// Normalize every number to the canonical "+63 XXX XXX XXXX" form before
// comparing. We normalize BOTH the CSV value and the stored volunteer phone so a
// match is found even if a volunteer's number was persisted in a legacy format.
function normalizeMobile(value?: string | null): string {
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

// ─── Import ───────────────────────────────────────────────────────────────────

function parseIntField(v: string): number | null {
  const n = parseInt(v, 10)
  return isNaN(n) ? null : n
}

type ImportRow = {
  mapped: Record<string, string>
  resolution: RowResolution
  existingId?: string
}

// A breakout group's matching profile (life stage, gender, language, age,
// meeting format, location, schedule) is inherited from the facilitator's linked
// small group, so the import only carries these few breakout-owned scalars.
type BreakoutScalars = {
  name: string
  facilitatorId: string | null
  linkedSmallGroupId: string | null
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

    // ── Pre-flight: load this event's volunteers so facilitators can be matched
    // by mobile. We normalize both sides in-app rather than filtering on the raw
    // phone in SQL, so legacy non-canonical stored numbers still match.
    const hasFacilitatorMobiles = rows.some((r) => normalizeMobile(r.mapped.facilitatorMobile))

    const eventVolunteers = hasFacilitatorMobiles
      ? await db.volunteer.findMany({
          where: { eventId: context.eventId },
          // Confirmed first so a member with multiple volunteer records on the
          // event resolves to the same one the create/edit form would offer.
          orderBy: [{ status: "asc" }, { createdAt: "asc" }],
          select: { id: true, member: { select: { phone: true, ledGroups: { select: { id: true } } } } },
        })
      : []

    // normalized phone → matched facilitator volunteer. We also pre-compute the
    // small group to auto-link: only when the facilitator leads exactly one group
    // (same rule as the form's auto-link and the small-group import back-fill).
    const mobileToFacilitator = new Map<string, { volunteerId: string; linkedSmallGroupId: string | null }>()
    for (const v of eventVolunteers) {
      const phone = normalizeMobile(v.member?.phone)
      if (!phone || mobileToFacilitator.has(phone)) continue
      mobileToFacilitator.set(phone, {
        volunteerId: v.id,
        linkedSmallGroupId: v.member!.ledGroups.length === 1 ? v.member!.ledGroups[0].id : null,
      })
    }

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

        const data: BreakoutScalars = {
          name,
          facilitatorId,
          linkedSmallGroupId,
          memberLimit: mapped.memberLimit ? parseIntField(mapped.memberLimit) : null,
        }

        // ── Update existing ──────────────────────────────────────────────────
        if (existingId) {
          const existing = await db.breakoutGroup.findUnique({
            where: { id: existingId },
            select: {
              eventId: true,
              name: true,
              facilitatorId: true,
              linkedSmallGroupId: true,
              memberLimit: true,
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
                  memberLimit: enrichNullable(existing.memberLimit, data.memberLimit),
                }
              : {
                  name: data.name,
                  facilitatorId: data.facilitatorId,
                  memberLimit: data.memberLimit,
                }

          // The small-group link is system-derived, not a CSV column — only ever
          // fill it in, never clear or overwrite an existing link (even on use-csv).
          await db.breakoutGroup.update({
            where: { id: existingId },
            data: { ...payload, linkedSmallGroupId: enrichNullable(existing.linkedSmallGroupId, data.linkedSmallGroupId) },
          })

          result.updated++
          continue
        }

        // ── Create new ───────────────────────────────────────────────────────
        await db.breakoutGroup.create({
          data: { eventId: context.eventId, ...data },
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
