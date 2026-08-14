"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import { memberSchema, type MemberFormValues } from "@/lib/validations/member"
import { checkDuplicateContactInfo } from "@/lib/duplicate-check"
import { buildScheduleSlot } from "@/lib/matching/candidate-schedule"
import { runBatchDelete, BatchDeleteBlocked } from "@/lib/batch"
import { logMembershipMove } from "@/lib/small-groups/membership-log"
import type { BatchDeleteResult } from "@/components/batch/types"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

async function requireWrite(): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canWrite(session, "Members")) return { error: "Unauthorized." }
  return null
}

export async function createMember(
  raw: MemberFormValues
): Promise<ActionResult<{ id: string }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = memberSchema.safeParse(raw)
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

    const member = await db.member.create({
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        nickname: parsed.data.nickname ?? null,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        address: parsed.data.address ?? null,
        dateJoined: parsed.data.dateJoined,
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
    revalidatePath("/members")
    return { success: true, data: { id: member.id } }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { success: false, error: "A member with this email already exists" }
    }
    return { success: false, error: "Failed to create member" }
  }
}

export async function updateMember(
  id: string,
  raw: MemberFormValues
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = memberSchema.safeParse(raw)
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
      excludeMemberId: id,
    })
    if (dup.conflict) return { success: false, error: dup.message }

    await db.member.update({
      where: { id },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        nickname: parsed.data.nickname ?? null,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        address: parsed.data.address ?? null,
        dateJoined: parsed.data.dateJoined,
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
    revalidatePath("/members")
    return { success: true, data: undefined }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { success: false, error: "A member with this email already exists" }
    }
    return { success: false, error: "Failed to update member" }
  }
}

export async function deleteMember(id: string): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const session = await auth()
    // The FK is ON DELETE RESTRICT, so this is enforced either way — the read is
    // here to name the groups instead of surfacing a bare constraint violation.
    const blocking = await describeLedGroups(id)
    if (blocking) return { success: false, error: blocking }

    await db.$transaction(async (tx) => {
      await logMemberDeparture(tx, id, session?.user?.id ?? null)
      await tx.member.delete({ where: { id } })
    })
    revalidatePath("/members")
    revalidatePath("/small-groups")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete member" }
  }
}

/**
 * Every DGroup has a leader, so a member who leads one cannot be deleted — the
 * group would be left with nobody. Returns the refusal to show the admin, naming
 * the groups so they know what to reassign, or null when nothing blocks.
 */
async function describeLedGroups(memberId: string): Promise<string | null> {
  const led = await db.smallGroup.findMany({
    where: { leaderId: memberId },
    select: { name: true },
    orderBy: { name: "asc" },
  })
  if (led.length === 0) return null

  const names = led.map((g) => `"${g.name}"`).join(", ")
  return `This member leads ${led.length === 1 ? "a DGroup" : `${led.length} DGroups`} (${names}). Assign a new leader before deleting them.`
}

/**
 * Records a deleted member's exit from their DGroup before the row disappears.
 *
 * `SmallGroupLog.memberId` is `ON DELETE SET NULL`, so their past entries survive
 * the delete but stop pointing at anyone — `description` is the only part that
 * still names them. Writing the departure first means the group's history ends
 * with a reason instead of a roster that quietly shrank.
 */
async function logMemberDeparture(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  memberId: string,
  actorUserId: string | null
): Promise<void> {
  const member = await tx.member.findUnique({
    where: { id: memberId },
    select: { firstName: true, lastName: true, smallGroupId: true },
  })
  if (!member?.smallGroupId) return

  await logMembershipMove(tx, {
    memberId,
    memberName: `${member.firstName} ${member.lastName}`,
    fromGroupId: member.smallGroupId,
    toGroupId: null,
    actor: { userId: actorUserId },
    context: "when their member record was deleted",
  })
}

export async function deleteMembersBatch(
  ids: string[]
): Promise<ActionResult<BatchDeleteResult>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (ids.length === 0) return { success: true, data: { deleted: 0, failed: [] } }

  try {
    const session = await auth()
    const members = await db.member.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true },
    })
    const names = new Map(
      members.map((m) => [m.id, `${m.firstName} ${m.lastName}`])
    )

    const result = await runBatchDelete({
      ids,
      names,
      deleteOne: async (id) => {
        // Rejected per-member rather than failing the whole batch: deleting nine
        // members shouldn't be blocked by the tenth turning out to lead a group.
        const blocking = await describeLedGroups(id)
        if (blocking) throw new BatchDeleteBlocked(blocking)

        await db.$transaction(async (tx) => {
          await logMemberDeparture(tx, id, session?.user?.id ?? null)
          await tx.member.delete({ where: { id } })
        })
      },
      fkReason: "leads a DGroup or has linked records",
    })

    revalidatePath("/members")
    revalidatePath("/small-groups")
    return { success: true, data: result }
  } catch {
    return { success: false, error: "Failed to delete members" }
  }
}

export async function setMembersLifeStageBatch(
  ids: string[],
  lifeStageId: string | null
): Promise<ActionResult<{ updated: number }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  if (ids.length === 0) return { success: true, data: { updated: 0 } }

  try {
    const result = await db.member.updateMany({
      where: { id: { in: ids } },
      data: { lifeStageId },
    })
    revalidatePath("/members")
    return { success: true, data: { updated: result.count } }
  } catch {
    return { success: false, error: "Failed to update life stage" }
  }
}

type MemberMatchingPrefs = {
  lifeStageId: string
  gender: string
  language: string[]
  workCity: string
  workIndustry: string
  meetingPreference: string
  scheduleDayOfWeek: string
  scheduleTimeStart: string
  scheduleTimeEnd: string
}

export async function saveMemberMatchingPreferences(
  memberId: string,
  prefs: MemberMatchingPrefs
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    // Schedule is optional and may be partly filled — the shared normaliser
    // decides what (if anything) that means as a slot, so the saved record and
    // the search agree.
    const slot = buildScheduleSlot(prefs)

    await db.member.update({
      where: { id: memberId },
      data: {
        lifeStageId: prefs.lifeStageId || null,
        gender: (prefs.gender as "Male" | "Female") || null,
        language: prefs.language,
        workCity: prefs.workCity || null,
        workIndustry: prefs.workIndustry || null,
        meetingPreference: (prefs.meetingPreference as "Online" | "Hybrid" | "InPerson") || null,
        schedulePreferences: {
          deleteMany: {},
          ...(slot
            ? {
                create: {
                  dayOfWeek: slot.dayOfWeek,
                  timeStart: slot.timeStart,
                  timeEnd: slot.timeEnd,
                },
              }
            : {}),
        },
      },
    })
    revalidatePath("/members")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to save matching preferences" }
  }
}
