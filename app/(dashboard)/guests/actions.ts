"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import { guestSchema, type GuestFormValues } from "@/lib/validations/guest"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createGuest(
  raw: GuestFormValues
): Promise<ActionResult<{ id: string }>> {
  const parsed = guestSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  try {
    const guest = await db.guest.create({
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        notes: parsed.data.notes ?? null,
        lifeStageId: parsed.data.lifeStageId ?? null,
        gender: parsed.data.gender ?? null,
        language: parsed.data.language,
        birthDate: parsed.data.birthDate ?? null,
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
  const parsed = guestSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    }
  }

  try {
    await db.guest.update({
      where: { id },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        notes: parsed.data.notes ?? null,
        lifeStageId: parsed.data.lifeStageId ?? null,
        gender: parsed.data.gender ?? null,
        language: parsed.data.language,
        birthDate: parsed.data.birthDate ?? null,
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
  try {
    await db.guest.delete({ where: { id } })
    revalidatePath("/guests")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete guest" }
  }
}

export async function promoteGuestToMember(
  guestId: string,
  groupId: string
): Promise<ActionResult<{ memberId: string }>> {
  try {
    const guest = await db.guest.findUnique({
      where: { id: guestId },
      select: {
        memberId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        notes: true,
        lifeStageId: true,
        gender: true,
        language: true,
        birthDate: true,
        workCity: true,
        workIndustry: true,
        meetingPreference: true,
        scheduleDayOfWeek: true,
        scheduleTimeStart: true,
        scheduleTimeEnd: true,
      },
    })

    if (!guest) return { success: false, error: "Guest not found" }
    if (guest.memberId) {
      return { success: false, error: "Guest has already been promoted to a member" }
    }

    const group = await db.smallGroup.findUnique({
      where: { id: groupId },
      select: {
        memberLimit: true,
        _count: { select: { members: true } },
      },
    })
    if (!group) return { success: false, error: "Small group not found" }
    if (group.memberLimit !== null && group._count.members >= group.memberLimit) {
      return {
        success: false,
        error: `This group has reached its member limit of ${group.memberLimit}`,
      }
    }

    const result = await db.$transaction(async (tx) => {
      const newMember = await tx.member.create({
        data: {
          firstName: guest.firstName,
          lastName: guest.lastName,
          email: guest.email ?? null,
          phone: guest.phone ?? null,
          notes: guest.notes ?? null,
          lifeStageId: guest.lifeStageId ?? null,
          gender: guest.gender ?? null,
          language: guest.language,
          birthDate: guest.birthDate ?? null,
          workCity: guest.workCity ?? null,
          workIndustry: guest.workIndustry ?? null,
          meetingPreference: guest.meetingPreference ?? null,
          dateJoined: new Date(),
          smallGroupId: groupId,
          groupStatus: "Member",
          ...(guest.scheduleDayOfWeek !== null &&
          guest.scheduleTimeStart !== null &&
          guest.scheduleTimeEnd !== null
            ? {
                schedulePreferences: {
                  create: {
                    dayOfWeek: guest.scheduleDayOfWeek,
                    timeStart: guest.scheduleTimeStart,
                    timeEnd: guest.scheduleTimeEnd,
                  },
                },
              }
            : {}),
        },
        select: { id: true },
      })

      await tx.guest.update({
        where: { id: guestId },
        data: { memberId: newMember.id },
      })

      await tx.eventRegistrant.updateMany({
        where: { guestId },
        data: { memberId: newMember.id, guestId: null },
      })

      return newMember.id
    })

    revalidatePath("/guests")
    revalidatePath("/members")
    revalidatePath(`/small-groups/${groupId}`)

    return { success: true, data: { memberId: result } }
  } catch {
    return { success: false, error: "Failed to promote guest to member" }
  }
}

// ─── Small Group Pipeline Actions ─────────────────────────────────────────────

const guestMatchingProfileSchema = z.object({
  lifeStageId: z.string().nullable().optional(),
  gender: z.enum(["Male", "Female"]).nullable().optional(),
  language: z.array(z.string()).optional(),
  meetingPreference: z.enum(["Online", "Hybrid", "InPerson"]).nullable().optional(),
  workCity: z.string().nullable().optional(),
  workIndustry: z.string().nullable().optional(),
  birthDate: z.string().nullable().optional(), // ISO date string or null
  scheduleDayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  scheduleTimeStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  scheduleTimeEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
})

export type GuestMatchingProfileInput = z.infer<typeof guestMatchingProfileSchema>

export async function saveGuestMatchingProfile(
  guestId: string,
  raw: GuestMatchingProfileInput
): Promise<ActionResult> {
  const parsed = guestMatchingProfileSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  try {
    await db.guest.update({
      where: { id: guestId },
      data: {
        lifeStageId: parsed.data.lifeStageId ?? null,
        gender: parsed.data.gender ?? null,
        language: parsed.data.language ?? [],
        meetingPreference: parsed.data.meetingPreference ?? null,
        workCity: parsed.data.workCity ?? null,
        workIndustry: parsed.data.workIndustry ?? null,
        birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : null,
        scheduleDayOfWeek: parsed.data.scheduleDayOfWeek ?? null,
        scheduleTimeStart: parsed.data.scheduleTimeStart ?? null,
        scheduleTimeEnd: parsed.data.scheduleTimeEnd ?? null,
      },
    })
    revalidatePath(`/guests/${guestId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save profile" }
  }
}

export async function saveGuestClaimedGroup(
  guestId: string,
  smallGroupId: string
): Promise<ActionResult> {
  try {
    const group = await db.smallGroup.findUnique({ where: { id: smallGroupId }, select: { id: true } })
    if (!group) return { success: false, error: "Small group not found" }
    await db.guest.update({
      where: { id: guestId },
      data: { claimedSmallGroupId: smallGroupId },
    })
    revalidatePath(`/guests/${guestId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save small group" }
  }
}

export async function clearGuestClaimedGroup(guestId: string): Promise<ActionResult> {
  try {
    await db.guest.update({
      where: { id: guestId },
      data: { claimedSmallGroupId: null },
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
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
        ],
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
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      take: 10,
    })
    return { success: true, data: guests }
  } catch {
    return { success: false, error: "Search failed" }
  }
}
