import "server-only"

import { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { formatPhilippinePhone } from "@/lib/utils"

type Schedule = { dayOfWeek: number; timeStart: string; timeEnd: string }

function scheduleFromText(value: string | undefined): Schedule | null {
  if (!value) return null
  const match = value.trim().match(/^(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s+([0-9]{1,2}:[0-9]{2})\s*(am|pm)?\s*(?:-|to)\s*([0-9]{1,2}:[0-9]{2})\s*(am|pm)?$/i)
  if (!match) return null
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
  const to24Hour = (raw: string, meridiem?: string) => {
    const [hoursText, minutes] = raw.split(":")
    let hours = Number(hoursText)
    if (meridiem?.toLowerCase() === "pm" && hours < 12) hours += 12
    if (meridiem?.toLowerCase() === "am" && hours === 12) hours = 0
    return `${String(hours).padStart(2, "0")}:${minutes}`
  }
  return { dayOfWeek: days.indexOf(match[1].slice(0, 3).toLowerCase()), timeStart: to24Hour(match[2], match[3]), timeEnd: to24Hour(match[4], match[5] ?? match[3]) }
}

function isRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export async function applySafeDGroupImport(batchId: string, userId: string) {
  const batch = await db.dGroupImportBatch.findFirst({ where: { id: batchId, userId, status: "ReadyForReview" }, include: { changes: { where: { status: "Proposed", kind: "dgroup_leader_metadata" } } } })
  if (!batch) return { error: "Import batch not found." }
  const claimed = await db.dGroupImportBatch.updateMany({ where: { id: batch.id, status: batch.status }, data: { status: "Applying" } })
  if (claimed.count !== 1) return { error: "This import batch is already being applied." }
  const applied: string[] = []
  const needsReview: string[] = []
  try {
    await db.$transaction(async (tx) => {
    for (const change of batch.changes) {
      if (!isRecord(change.proposedData)) continue
      const phone = typeof change.proposedData.phone === "string" ? change.proposedData.phone : ""
      const schedule = scheduleFromText(typeof change.proposedData.schedule === "string" ? change.proposedData.schedule : undefined)
      if (!phone || !schedule) { needsReview.push(change.id); continue }
      const members = await tx.member.findMany({ where: { phone: formatPhilippinePhone(phone) }, select: { id: true }, take: 2 })
      const member = members.length === 1 ? members[0] : null
      const groups = member ? await tx.smallGroup.findMany({ where: { leaderId: member.id }, select: { id: true, scheduleDayOfWeek: true, scheduleTimeStart: true, scheduleTimeEnd: true }, take: 2 }) : []
      const group = groups.length === 1 ? groups[0] : null
      if (!group) { needsReview.push(change.id); continue }
      const before = { scheduleDayOfWeek: group.scheduleDayOfWeek, scheduleTimeStart: group.scheduleTimeStart, scheduleTimeEnd: group.scheduleTimeEnd }
      const after = { scheduleDayOfWeek: schedule.dayOfWeek, scheduleTimeStart: schedule.timeStart, scheduleTimeEnd: schedule.timeEnd }
      await tx.smallGroup.update({ where: { id: group.id }, data: after })
      await tx.smallGroupLog.create({ data: { smallGroupId: group.id, action: "GroupUpdated", performedByUserId: userId, description: "Schedule updated through a Churchie MCP workbook import" } })
      await tx.dGroupImportChange.update({ where: { id: change.id }, data: { status: "Applied", targetType: "SmallGroup", targetId: group.id, appliedData: { before, after } } })
      applied.push(change.id)
    }
    if (needsReview.length) await tx.dGroupImportChange.updateMany({ where: { id: { in: needsReview } }, data: { status: "NeedsReview" } })
    await tx.dGroupImportBatch.update({ where: { id: batch.id }, data: { status: needsReview.length ? "CompletedWithErrors" : "Completed", appliedAt: new Date(), undoUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } })
    })
  } catch {
    await db.dGroupImportBatch.updateMany({ where: { id: batch.id, status: "Applying" }, data: { status: batch.status } })
    return { error: "The import could not be applied. No Churchie records were changed." }
  }
  return { applied: applied.length, needsReview: needsReview.length }
}

export async function confirmDGroupImportReview(batchId: string, userId: string, columnDecisions: Record<string, "churchie" | "review_only" | "external">) {
  const result = await db.dGroupImportBatch.updateMany({
    where: { id: batchId, userId, status: "NeedsClarification" },
    data: { status: "ReadyForReview", columnDecisions },
  })
  return result.count === 1
    ? { success: true, status: "ReadyForReview" as const }
    : { error: "Import batch is unavailable or has already been reviewed." }
}

export async function undoSafeDGroupImport(batchId: string, userId: string) {
  const batch = await db.dGroupImportBatch.findFirst({ where: { id: batchId, userId, undoUntil: { gt: new Date() } }, include: { changes: { where: { status: "Applied", targetType: "SmallGroup" } } } })
  if (!batch) return { error: "This batch cannot be undone." }
  let conflicts = 0
  let undone = 0
  await db.$transaction(async (tx) => {
    for (const change of batch.changes) {
      if (!change.targetId || !isRecord(change.appliedData)) continue
      const before = change.appliedData.before as Prisma.JsonObject
      const after = change.appliedData.after as Prisma.JsonObject
      const group = await tx.smallGroup.findUnique({ where: { id: change.targetId }, select: { scheduleDayOfWeek: true, scheduleTimeStart: true, scheduleTimeEnd: true } })
      if (!group || group.scheduleDayOfWeek !== after.scheduleDayOfWeek || group.scheduleTimeStart !== after.scheduleTimeStart || group.scheduleTimeEnd !== after.scheduleTimeEnd) {
        await tx.dGroupImportChange.update({ where: { id: change.id }, data: { status: "UndoConflict" } }); conflicts++; continue
      }
      await tx.smallGroup.update({ where: { id: change.targetId }, data: { scheduleDayOfWeek: before.scheduleDayOfWeek as number | null, scheduleTimeStart: before.scheduleTimeStart as string | null, scheduleTimeEnd: before.scheduleTimeEnd as string | null } })
      await tx.dGroupImportChange.update({ where: { id: change.id }, data: { status: "Undone" } }); undone++
    }
    await tx.dGroupImportBatch.update({ where: { id: batch.id }, data: { status: conflicts ? "UndoConflicts" : "Undone", undoneAt: new Date() } })
  })
  return { undone, conflicts }
}
