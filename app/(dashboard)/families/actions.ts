"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import {
  familySchema,
  familyMemberSchema,
  type FamilyInput,
  type FamilyMemberInput,
} from "@/lib/validations/family"

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

async function requireWrite(): Promise<{ error: string } | null> {
  const session = await auth()
  if (!session?.user) return { error: "Not authenticated." }
  if (!canWrite(session, "Members")) return { error: "Unauthorized." }
  return null
}

function revalidateFamily(familyId: string) {
  revalidatePath("/families")
  revalidatePath(`/families/${familyId}`)
}

export async function createFamily(
  raw: FamilyInput
): Promise<ActionResult<{ id: string }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = familySchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    const family = await db.family.create({
      data: { name: parsed.data.name, notes: parsed.data.notes ?? null },
      select: { id: true },
    })
    revalidatePath("/families")
    return { success: true, data: { id: family.id } }
  } catch {
    return { success: false, error: "Failed to create family" }
  }
}

export async function updateFamily(
  id: string,
  raw: FamilyInput
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = familySchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  try {
    await db.family.update({
      where: { id },
      data: { name: parsed.data.name, notes: parsed.data.notes ?? null },
    })
    revalidateFamily(id)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update family" }
  }
}

export async function deleteFamily(id: string): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    await db.family.delete({ where: { id } })
    revalidatePath("/families")
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to delete family" }
  }
}

export async function addFamilyMember(
  familyId: string,
  raw: FamilyMemberInput
): Promise<ActionResult<{ id: string }>> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = familyMemberSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const { memberId, guestId, role } = parsed.data

  try {
    const family = await db.family.findUnique({ where: { id: familyId }, select: { id: true } })
    if (!family) return { success: false, error: "Family not found" }

    if (memberId) {
      const member = await db.member.findUnique({ where: { id: memberId }, select: { id: true } })
      if (!member) return { success: false, error: "Member not found" }
    } else if (guestId) {
      const guest = await db.guest.findUnique({
        where: { id: guestId },
        select: { memberId: true },
      })
      if (!guest) return { success: false, error: "Guest not found" }
      if (guest.memberId) {
        return {
          success: false,
          error: "This guest has been promoted to a member — add them as a member instead",
        }
      }
    }

    const duplicate = await db.familyMember.findFirst({
      where: { familyId, ...(memberId ? { memberId } : { guestId }) },
      select: { id: true },
    })
    if (duplicate) {
      return { success: false, error: "This person is already part of the family" }
    }

    const link = await db.familyMember.create({
      data: {
        familyId,
        memberId: memberId ?? null,
        guestId: guestId ?? null,
        role,
      },
      select: { id: true },
    })
    revalidateFamily(familyId)
    if (memberId) revalidatePath(`/members/${memberId}`)
    if (guestId) revalidatePath(`/guests/${guestId}`)
    return { success: true, data: { id: link.id } }
  } catch {
    return { success: false, error: "Failed to add family member" }
  }
}

export async function updateFamilyMemberRole(
  familyMemberId: string,
  role: FamilyMemberInput["role"]
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  const parsed = familyMemberSchema.shape.role.safeParse(role)
  if (!parsed.success) return { success: false, error: "Invalid role" }

  try {
    const link = await db.familyMember.update({
      where: { id: familyMemberId },
      data: { role: parsed.data },
      select: { familyId: true, memberId: true },
    })
    revalidateFamily(link.familyId)
    if (link.memberId) revalidatePath(`/members/${link.memberId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to update role" }
  }
}

export async function removeFamilyMember(
  familyMemberId: string
): Promise<ActionResult> {
  const authError = await requireWrite()
  if (authError) return { success: false, error: authError.error }

  try {
    const link = await db.familyMember.delete({
      where: { id: familyMemberId },
      select: { familyId: true, memberId: true, guestId: true },
    })
    revalidateFamily(link.familyId)
    if (link.memberId) revalidatePath(`/members/${link.memberId}`)
    if (link.guestId) revalidatePath(`/guests/${link.guestId}`)
    return { success: true, data: undefined }
  } catch {
    return { success: false, error: "Failed to remove family member" }
  }
}

// ─── People search for the add-member picker ─────────────────────────────────

export type FamilyPersonSearchResult = {
  type: "member" | "guest"
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
}

export async function searchPeopleForFamily(
  query: string,
  excludeFamilyId?: string
): Promise<ActionResult<FamilyPersonSearchResult[]>> {
  const session = await auth()
  if (!session?.user) return { success: false, error: "Not authenticated." }

  const q = query.trim()
  if (q.length < 2) return { success: true, data: [] }

  const nameFilter = [
    { firstName: { contains: q, mode: "insensitive" as const } },
    { lastName: { contains: q, mode: "insensitive" as const } },
    { nickname: { contains: q, mode: "insensitive" as const } },
    { phone: { contains: q, mode: "insensitive" as const } },
    { email: { contains: q, mode: "insensitive" as const } },
  ]

  try {
    const [members, guests] = await Promise.all([
      db.member.findMany({
        where: {
          OR: nameFilter,
          ...(excludeFamilyId
            ? { familyMemberships: { none: { familyId: excludeFamilyId } } }
            : {}),
        },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        take: 8,
      }),
      db.guest.findMany({
        where: {
          memberId: null, // promoted guests are represented by their member record
          OR: nameFilter,
          ...(excludeFamilyId
            ? { familyMemberships: { none: { familyId: excludeFamilyId } } }
            : {}),
        },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        take: 8,
      }),
    ])

    return {
      success: true,
      data: [
        ...members.map((m) => ({ type: "member" as const, ...m })),
        ...guests.map((g) => ({ type: "guest" as const, ...g })),
      ],
    }
  } catch {
    return { success: false, error: "Search failed" }
  }
}
