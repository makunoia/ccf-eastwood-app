"use server"

import { revalidatePath } from "next/cache"
import type { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import { guestSchema, type GuestFormValues } from "@/lib/validations/guest"
import {
  matchingProfileSchema,
  type MatchingProfileInput,
} from "@/lib/validations/matching-profile"
import { applyGuestMatchingProfile } from "@/lib/people/matching-profile"
import { checkDuplicateContactInfo } from "@/lib/duplicate-check"
import {
  PROMOTABLE_GUEST_SELECT,
  assertGroupCapacity,
  promoteGuestRecord,
} from "@/lib/people/promote-guest"
import { runBatchDelete } from "@/lib/batch"
import { PERSON_NAME_FIELDS, personSearchWhere } from "@/lib/search/name-search"
import type { BatchDeleteResult } from "@/components/batch/types"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

async function requireWrite(): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canWrite(session, "Guests")) return { error: "Unauthorized." }
  return null
}

export async function createGuest(
  raw: GuestFormValues
): Promise<ActionResult<{ id: string }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = guestSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  try {
    const dup = await checkDuplicateContactInfo({
      phone: parsed.data.phone,
      email: parsed.data.email,
    })
    if (dup.conflict) return { success: false, error: dup.message }

    const guest = await db.guest.create({
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        nickname: parsed.data.nickname ?? null,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        notes: parsed.data.notes ?? null,
        lifeStageId: parsed.data.lifeStageId ?? null,
        gender: parsed.data.gender ?? null,
        language: parsed.data.language,
        birthMonth: parsed.data.birthMonth ?? null,
        birthYear: parsed.data.birthYear ?? null,
        ageRangeBucketId: parsed.data.ageRangeBucketId ?? null,
        workCity: parsed.data.workCity ?? null,
        workIndustry: parsed.data.workIndustry ?? null,
        meetingPreference: parsed.data.meetingPreference ?? null,
      },
      select: { id: true },
    })
    revalidatePath("/guests")
    return { success: true, data: { id: guest.id } }
  } catch {
    return { success: false, error: "Failed to create guest" }
  }
}

export async function updateGuest(
  id: string,
  raw: GuestFormValues
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = guestSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  try {
    const dup = await checkDuplicateContactInfo({
      phone: parsed.data.phone,
      email: parsed.data.email,
      excludeGuestId: id,
    })
    if (dup.conflict) return { success: false, error: dup.message }

    await db.guest.update({
      where: { id },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        nickname: parsed.data.nickname ?? null,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        notes: parsed.data.notes ?? null,
        lifeStageId: parsed.data.lifeStageId ?? null,
        gender: parsed.data.gender ?? null,
        language: parsed.data.language,
        birthMonth: parsed.data.birthMonth ?? null,
        birthYear: parsed.data.birthYear ?? null,
        ageRangeBucketId: parsed.data.ageRangeBucketId ?? null,
        workCity: parsed.data.workCity ?? null,
        workIndustry: parsed.data.workIndustry ?? null,
        meetingPreference: parsed.data.meetingPreference ?? null,
      },
    })
    revalidatePath("/guests")
    revalidatePath(`/guests/${id}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update guest" }
  }
}

export async function deleteGuest(id: string): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    await db.guest.delete({ where: { id } })
    revalidatePath("/guests")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete guest" }
  }
}

export async function deleteGuestsBatch(
  ids: string[]
): Promise<ActionResult<BatchDeleteResult>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (ids.length === 0) return { success: true, data: { deleted: 0, failed: [] } }

  try {
    const guests = await db.guest.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true },
    })
    const names = new Map(
      guests.map((g) => [g.id, `${g.firstName} ${g.lastName}`])
    )

    const result = await runBatchDelete({
      ids,
      names,
      deleteOne: (id) => db.guest.delete({ where: { id } }).then(() => undefined),
      fkReason: "has linked event records",
    })

    revalidatePath("/guests")
    return { success: true, data: result }
  } catch {
    return { success: false, error: "Failed to delete guests" }
  }
}

export async function setGuestsLifeStageBatch(
  ids: string[],
  lifeStageId: string | null
): Promise<ActionResult<{ updated: number }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (ids.length === 0) return { success: true, data: { updated: 0 } }

  try {
    const result = await db.guest.updateMany({
      where: { id: { in: ids } },
      data: { lifeStageId },
    })
    revalidatePath("/guests")
    return { success: true, data: { updated: result.count } }
  } catch {
    return { success: false, error: "Failed to update life stage" }
  }
}

export async function promoteGuestToMember(
  guestId: string,
  groupId: string
): Promise<ActionResult<{ memberId: string }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const guest = await db.guest.findUnique({
      where: { id: guestId },
      select: PROMOTABLE_GUEST_SELECT,
    })

    if (!guest) return { success: false, error: "Guest not found" }
    if (guest.memberId) {
      return { success: false, error: "Guest has already been promoted to a member" }
    }

    const dup = await checkDuplicateContactInfo({
      phone: guest.phone,
      email: guest.email,
      excludeGuestId: guestId,
    })
    if (dup.conflict) return { success: false, error: dup.message }

    const group = await db.smallGroup.findUnique({
      where: { id: groupId },
      select: { id: true, status: true },
    })
    if (!group) return { success: false, error: "DGroup not found" }

    const overCapacity = await assertGroupCapacity(db, groupId)
    if (overCapacity) return { success: false, error: overCapacity }

    const guestEventIds = await db.eventRegistrant.findMany({
      where: { guestId },
      select: { eventId: true },
    })

    const result = await db.$transaction(async (tx) => {
      const { memberId } = await promoteGuestRecord(tx, {
        guestId,
        guest,
        dateJoined: new Date(),
        group,
        schedule: "raw",
      })
      return memberId
    })

    revalidatePath("/guests")
    revalidatePath("/members")
    revalidatePath(`/small-groups/${groupId}`)
    for (const { eventId } of guestEventIds) {
      revalidatePath(`/event/${eventId}/dashboard`)
    }

    return { success: true, data: { memberId: result } }
  } catch {
    return { success: false, error: "Failed to promote guest to member" }
  }
}

// ─── Small Group Pipeline Actions ─────────────────────────────────────────────

/**
 * Saves the guest's matching profile. The write itself lives in
 * `applyGuestMatchingProfile` so the public check-in kiosk — which has no
 * session and so cannot call this action — writes the same columns the same way.
 */
export async function saveGuestMatchingProfile(
  guestId: string,
  raw: MatchingProfileInput
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = matchingProfileSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  try {
    await applyGuestMatchingProfile(guestId, parsed.data)
    revalidatePath(`/guests/${guestId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save profile" }
  }
}

// Setting a guest's claimed group happens on the public check-in kiosk, which
// has no session — see `saveCheckinClaimedGroup` in the events actions. Only the
// clear side is an admin action.
export async function clearGuestClaimedGroup(guestId: string): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    await db.guest.update({
      where: { id: guestId },
      data: { claimedSmallGroupId: null, claimedSatellite: null },
    })
    revalidatePath(`/guests/${guestId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to clear claimed group" }
  }
}

type MemberLeaderResult = {
  id: string
  firstName: string
  lastName: string
  ledGroups: { id: string; name: string }[]
}

export async function searchMembersForLeaderLookup(
  query: string
): Promise<ActionResult<MemberLeaderResult[]>> {
  const q = query.trim()
  if (q.length < 2) return { success: true, data: [] }
  try {
    const members = await db.member.findMany({
      where: {
        ...(personSearchWhere(q, { fields: PERSON_NAME_FIELDS }) as Prisma.MemberWhereInput),
        ledGroups: { some: {} }, // only members who lead at least one group
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        ledGroups: { select: { id: true, name: true } },
      },
      take: 10,
    })
    return { success: true, data: members }
  } catch {
    return { success: false, error: "Search failed" }
  }
}

// ─── Guest Search ──────────────────────────────────────────────────────────────

type GuestSearchResult = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
}

export async function searchGuests(
  query: string
): Promise<ActionResult<GuestSearchResult[]>> {
  const q = query.trim()
  if (q.length < 2) return { success: true, data: [] }
  try {
    const guests = await db.guest.findMany({
      where: {
        memberId: null, // only non-promoted guests
        ...(personSearchWhere(q) as Prisma.GuestWhereInput),
      },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      take: 10,
    })
    return { success: true, data: guests }
  } catch {
    return { success: false, error: "Search failed" }
  }
}
