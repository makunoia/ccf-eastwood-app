"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { guestSchema, type GuestFormValues } from "@/lib/validations/guest"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

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

    const firstStatus = await db.smallGroupStatus.findFirst({
      orderBy: { order: "asc" },
      select: { id: true },
    })

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
          smallGroupStatusId: firstStatus?.id ?? null,
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
