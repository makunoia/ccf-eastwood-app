"use server"

import { revalidatePath } from "next/cache"
import type { Guest } from "@/app/generated/prisma/client"
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
    // Our own validation throws carry safe, user-facing messages. Anything from
    // Prisma (carries a `P####` code) must never be surfaced raw — map it to a
    // generic message per the project's error-handling convention.
    const code = (e as { code?: unknown })?.code
    if (typeof code === "string" && /^P\d+/.test(code)) {
      return { success: false, error: "Failed to merge records due to a data conflict." }
    }
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

/**
 * Folds a loser Guest into a keeper Guest: re-points the loser's owned rows onto
 * the keeper, deletes the loser, then fills the keeper's null/empty fields.
 *
 * Deliberately does NOT touch `memberId` — that column is unique, so callers must
 * decide how to transfer the promotion link (and only after the loser is gone).
 */
async function foldGuestIntoGuest(tx: TxClient, keeper: Guest, loser: Guest) {
  await tx.eventRegistrant.updateMany({ where: { guestId: loser.id }, data: { guestId: keeper.id } })
  await tx.smallGroupMemberRequest.updateMany({ where: { guestId: loser.id }, data: { guestId: keeper.id } })
  await tx.smallGroupLog.updateMany({ where: { guestId: loser.id }, data: { guestId: keeper.id } })

  // Delete the loser BEFORE filling the keeper — `fillNulls` can copy a value the
  // loser still holds, colliding with its own row. `loser` is already in memory.
  await tx.guest.delete({ where: { id: loser.id } })

  const fill = fillNulls(keeper, loser)
  delete (fill as { id?: unknown }).id
  delete (fill as { createdAt?: unknown }).createdAt
  delete (fill as { updatedAt?: unknown }).updatedAt
  delete (fill as { memberId?: unknown }).memberId
  if (Object.keys(fill).length > 0) {
    await tx.guest.update({ where: { id: keeper.id }, data: fill })
    Object.assign(keeper, fill)
  }
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
      // Any Guest promoted into the loser: re-point its promotion link to the keeper.
      // `Guest.memberId` is unique, so if the keeper already retains its own linked
      // guest we fold the loser's guest into it rather than blindly re-pointing
      // (which would hit a P2002 unique-constraint violation).
      const loserGuest = await tx.guest.findUnique({ where: { memberId: m.id } })
      if (loserGuest) {
        const keeperGuest = await tx.guest.findUnique({ where: { memberId: keeperId } })
        if (keeperGuest) {
          await foldGuestIntoGuest(tx, keeperGuest, loserGuest)
        } else {
          await tx.guest.update({ where: { id: loserGuest.id }, data: { memberId: keeperId } })
        }
      }

      // Delete the loser BEFORE filling the keeper. `fillNulls` can copy unique
      // fields (email, phone) from the loser onto the keeper; if the loser still
      // existed, that update would collide with the loser's own value and throw
      // a P2002 unique-constraint error. `m` is already in memory, so deleting
      // first is safe.
      await tx.member.delete({ where: { id: m.id } })

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

      // Retain the loser Guest as history linked to the keeper Member. `Guest.memberId`
      // is unique: if the keeper already retains its own linked guest, it can't take a
      // second one. g's activity rows were already re-pointed to the keeper member
      // above, so fold g's remaining profile into the keeper's guest and drop g.
      const existingKeeperGuest = await tx.guest.findUnique({ where: { memberId: keeperId } })
      if (existingKeeperGuest) {
        await tx.guest.delete({ where: { id: g.id } })
        const gFill = fillNulls(
          existingKeeperGuest as unknown as Record<string, unknown>,
          g as unknown as Record<string, unknown>,
        )
        delete gFill.id
        delete gFill.createdAt
        delete gFill.updatedAt
        delete gFill.memberId
        if (Object.keys(gFill).length > 0) {
          await tx.guest.update({ where: { id: existingKeeperGuest.id }, data: gFill })
        }
      } else {
        await tx.guest.update({ where: { id: g.id }, data: { memberId: keeperId } })
      }
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

    // If the loser Guest was already promoted, capture its memberId BEFORE the
    // fold deletes it. `Guest.memberId` is unique, so the link can only be
    // transferred onto the keeper once the loser row is gone.
    const inheritMemberId = g.memberId && !keeper.memberId ? g.memberId : null

    await foldGuestIntoGuest(tx, keeper, g)

    if (inheritMemberId) {
      await tx.guest.update({ where: { id: keeper.id }, data: { memberId: inheritMemberId } })
      keeper.memberId = inheritMemberId
    }
  }
}
