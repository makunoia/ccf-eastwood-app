"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { isSuperAdmin } from "@/lib/permissions"

type DuplicateRecord = {
  id: string
  firstName: string
  lastName: string
  recordType: "member" | "guest"
}

type DuplicateGroup = {
  field: "phone" | "email"
  value: string
  records: DuplicateRecord[]
}

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function getDuplicateProfiles(): Promise<ActionResult<DuplicateGroup[]>> {
  try {
    const [members, guests] = await Promise.all([
      db.member.findMany({
        select: { id: true, firstName: true, lastName: true, phone: true, email: true },
      }),
      db.guest.findMany({
        where: { memberId: null },
        select: { id: true, firstName: true, lastName: true, phone: true, email: true },
      }),
    ])

    const phoneMap = new Map<string, DuplicateRecord[]>()
    const emailMap = new Map<string, DuplicateRecord[]>()

    for (const m of members) {
      const record: DuplicateRecord = { id: m.id, firstName: m.firstName, lastName: m.lastName, recordType: "member" }
      if (m.phone) {
        const key = m.phone.trim().toLowerCase()
        phoneMap.set(key, [...(phoneMap.get(key) ?? []), record])
      }
      if (m.email) {
        const key = m.email.trim().toLowerCase()
        emailMap.set(key, [...(emailMap.get(key) ?? []), record])
      }
    }

    for (const g of guests) {
      const record: DuplicateRecord = { id: g.id, firstName: g.firstName, lastName: g.lastName, recordType: "guest" }
      if (g.phone) {
        const key = g.phone.trim().toLowerCase()
        phoneMap.set(key, [...(phoneMap.get(key) ?? []), record])
      }
      if (g.email) {
        const key = g.email.trim().toLowerCase()
        emailMap.set(key, [...(emailMap.get(key) ?? []), record])
      }
    }

    const groups: DuplicateGroup[] = []

    for (const [value, records] of phoneMap) {
      if (records.length > 1) groups.push({ field: "phone", value, records })
    }
    for (const [value, records] of emailMap) {
      if (records.length > 1) groups.push({ field: "email", value, records })
    }

    return { success: true, data: groups }
  } catch {
    return { success: false, error: "Failed to load duplicate profiles" }
  }
}

// ─── Merge / resolve ──────────────────────────────────────────────────────────

type LoserRef = { id: string; type: "member" | "guest" }

export type ResolveDuplicateInput = {
  keeperId: string
  keeperType: "member" | "guest"
  losers: LoserRef[]
}

/**
 * Resolves a duplicate group by merging losers into the keeper.
 *
 * Field-merge strategy: keeper wins on every field that already has a value;
 * any null/blank field on the keeper gets filled from the first loser that has data.
 *
 * Relations: all rows owned by losers are re-pointed at the keeper, then losers
 * are deleted. For Member↔Guest pairs, the Guest is preserved with `memberId`
 * linked to the keeper Member (mirrors the existing promotion flow).
 */
export async function resolveDuplicateGroup(
  input: ResolveDuplicateInput,
): Promise<ActionResult<{ merged: number }>> {
  const session = await auth()
  if (!isSuperAdmin(session)) return { success: false, error: "Unauthorized" }

  const result = await runSingleMerge(input)
  if (result.success) {
    revalidatePath("/settings/duplicate-profiles")
    revalidatePath("/members")
    revalidatePath("/guests")
  }
  return result
}

async function runSingleMerge(
  input: ResolveDuplicateInput,
): Promise<ActionResult<{ merged: number }>> {
  if (input.losers.length === 0) {
    return { success: false, error: "No records to merge" }
  }
  if (input.losers.some((l) => l.id === input.keeperId)) {
    return { success: false, error: "Keeper cannot be in the losers list" }
  }

  try {
    await db.$transaction(async (tx) => {
      if (input.keeperType === "member") {
        await mergeIntoMember(tx, input.keeperId, input.losers)
      } else {
        await mergeIntoGuest(tx, input.keeperId, input.losers)
      }
    }, { timeout: 30_000 })

    return { success: true, data: { merged: input.losers.length } }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to merge records"
    return { success: false, error: msg }
  }
}

export type BatchMergeItemResult =
  | { index: number; success: true; merged: number }
  | { index: number; success: false; error: string }

export type BatchMergeResult = {
  total: number
  succeeded: number
  failed: number
  totalMerged: number
  items: BatchMergeItemResult[]
}

/**
 * Resolves multiple duplicate groups in one call. Each group runs in its own
 * transaction so a failure in one doesn't roll back the others — the action
 * returns per-item results so the UI can surface partial successes.
 */
export async function resolveDuplicateGroups(
  inputs: ResolveDuplicateInput[],
): Promise<ActionResult<BatchMergeResult>> {
  const session = await auth()
  if (!isSuperAdmin(session)) return { success: false, error: "Unauthorized" }

  if (inputs.length === 0) {
    return { success: false, error: "Nothing to merge" }
  }

  const items: BatchMergeItemResult[] = []
  let succeeded = 0
  let failed = 0
  let totalMerged = 0

  for (let i = 0; i < inputs.length; i++) {
    const result = await runSingleMerge(inputs[i])
    if (result.success) {
      items.push({ index: i, success: true, merged: result.data.merged })
      succeeded++
      totalMerged += result.data.merged
    } else {
      items.push({ index: i, success: false, error: result.error })
      failed++
    }
  }

  revalidatePath("/settings/duplicate-profiles")
  revalidatePath("/members")
  revalidatePath("/guests")

  return {
    success: true,
    data: { total: inputs.length, succeeded, failed, totalMerged, items },
  }
}

type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0]

// Fill the keeper's null/empty fields from the loser. Keeper wins on every conflict.
function fillNulls<T extends Record<string, unknown>>(keeper: T, loser: T): Partial<T> {
  const update: Partial<T> = {}
  for (const k of Object.keys(loser) as (keyof T)[]) {
    const kv = keeper[k]
    const lv = loser[k]
    if (lv === null || lv === undefined) continue
    if (Array.isArray(kv) && kv.length === 0 && Array.isArray(lv) && lv.length > 0) {
      update[k] = lv
      continue
    }
    if (kv === null || kv === undefined || kv === "") {
      update[k] = lv
    }
  }
  return update
}

async function mergeIntoMember(tx: TxClient, keeperId: string, losers: LoserRef[]) {
  const keeper = await tx.member.findUnique({ where: { id: keeperId } })
  if (!keeper) throw new Error("Keeper member not found")

  for (const loser of losers) {
    if (loser.type === "member") {
      const m = await tx.member.findUnique({ where: { id: loser.id } })
      if (!m) continue

      // Re-point all relations from loser → keeper
      await tx.eventRegistrant.updateMany({ where: { memberId: m.id }, data: { memberId: keeperId } })
      await tx.volunteer.updateMany({ where: { memberId: m.id }, data: { memberId: keeperId } })
      await tx.smallGroupMemberRequest.updateMany({ where: { memberId: m.id }, data: { memberId: keeperId } })
      await tx.smallGroupLog.updateMany({ where: { memberId: m.id }, data: { memberId: keeperId } })
      await tx.memberLog.updateMany({ where: { memberId: m.id }, data: { memberId: keeperId } })
      await tx.schedulePreference.updateMany({ where: { memberId: m.id }, data: { memberId: keeperId } })
      // Any group the loser leads: re-point leader to keeper.
      await tx.smallGroup.updateMany({ where: { leaderId: m.id }, data: { leaderId: keeperId } })
      // Any Guest that was promoted into the loser: re-point its memberId to the keeper.
      await tx.guest.updateMany({ where: { memberId: m.id }, data: { memberId: keeperId } })

      // Merge field values into keeper (fill nulls only)
      const fill = fillNulls(keeper, m)
      // Don't overwrite the keeper's smallGroupId from the loser's — could create circular refs
      delete (fill as { smallGroupId?: unknown }).smallGroupId
      delete (fill as { id?: unknown }).id
      delete (fill as { createdAt?: unknown }).createdAt
      delete (fill as { updatedAt?: unknown }).updatedAt
      if (Object.keys(fill).length > 0) {
        await tx.member.update({ where: { id: keeperId }, data: fill })
        Object.assign(keeper, fill)
      }

      await tx.member.delete({ where: { id: m.id } })
    } else {
      // Guest → Member promotion
      const g = await tx.guest.findUnique({ where: { id: loser.id } })
      if (!g) continue

      // Move all Guest's event registrations to the keeper Member
      await tx.eventRegistrant.updateMany({
        where: { guestId: g.id },
        data: { guestId: null, memberId: keeperId },
      })
      await tx.smallGroupMemberRequest.updateMany({
        where: { guestId: g.id },
        data: { guestId: null, memberId: keeperId },
      })
      await tx.smallGroupLog.updateMany({
        where: { guestId: g.id },
        data: { guestId: null, memberId: keeperId },
      })

      // Fill keeper's null/empty fields from the Guest's matching data
      const fill = fillNulls(keeper as unknown as Record<string, unknown>, g as unknown as Record<string, unknown>)
      delete fill.id
      delete fill.createdAt
      delete fill.updatedAt
      delete fill.memberId
      delete fill.notes // notes handled separately to avoid clobbering
      delete fill.claimedSmallGroupId
      delete fill.scheduleDayOfWeek
      delete fill.scheduleTimeStart
      delete fill.scheduleTimeEnd
      if (Object.keys(fill).length > 0) {
        await tx.member.update({ where: { id: keeperId }, data: fill })
        Object.assign(keeper, fill)
      }

      // Link the Guest to the keeper Member (retain Guest as history)
      await tx.guest.update({
        where: { id: g.id },
        data: { memberId: keeperId },
      })
    }
  }
}

async function mergeIntoGuest(tx: TxClient, keeperId: string, losers: LoserRef[]) {
  const keeper = await tx.guest.findUnique({ where: { id: keeperId } })
  if (!keeper) throw new Error("Keeper guest not found")

  for (const loser of losers) {
    if (loser.type !== "guest") {
      // Merging a Member into a Guest is not supported — the user should
      // pick the Member as keeper instead.
      throw new Error("Cannot merge a Member into a Guest. Pick the Member as the keeper.")
    }
    const g = await tx.guest.findUnique({ where: { id: loser.id } })
    if (!g) continue

    // Re-point all Guest-owned rows
    await tx.eventRegistrant.updateMany({ where: { guestId: g.id }, data: { guestId: keeperId } })
    await tx.smallGroupMemberRequest.updateMany({ where: { guestId: g.id }, data: { guestId: keeperId } })
    await tx.smallGroupLog.updateMany({ where: { guestId: g.id }, data: { guestId: keeperId } })

    // If the loser Guest was already promoted (has memberId), surface that link on the keeper
    if (g.memberId && !keeper.memberId) {
      await tx.guest.update({ where: { id: keeperId }, data: { memberId: g.memberId } })
      keeper.memberId = g.memberId
    }

    const fill = fillNulls(keeper, g)
    delete (fill as { id?: unknown }).id
    delete (fill as { createdAt?: unknown }).createdAt
    delete (fill as { updatedAt?: unknown }).updatedAt
    delete (fill as { memberId?: unknown }).memberId
    if (Object.keys(fill).length > 0) {
      await tx.guest.update({ where: { id: keeperId }, data: fill })
      Object.assign(keeper, fill)
    }

    await tx.guest.delete({ where: { id: g.id } })
  }
}
