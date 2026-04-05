"use server"

import { db } from "@/lib/db"

// ─── Member lookup ────────────────────────────────────────────────────────────

export async function lookupMemberByMobile(mobile: string): Promise<{
  id: string
  firstName: string
  lastName: string
  email: string | null
} | null> {
  const member = await db.member.findFirst({
    where: { phone: mobile.trim() },
    select: { id: true, firstName: true, lastName: true, email: true },
  })
  return member
}

// ─── Submit volunteer sign-up ─────────────────────────────────────────────────

type SignUpInput = {
  memberId: string
  ministryId?: string
  eventId?: string
  committeeId: string
  preferredRoleId: string
  notes: string
}

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function submitVolunteerSignUp(
  input: SignUpInput
): Promise<ActionResult<{ id: string }>> {
  const { memberId, ministryId, eventId, committeeId, preferredRoleId, notes } = input

  if (!ministryId && !eventId) {
    return { success: false, error: "Invalid sign-up context" }
  }
  if (!committeeId || !preferredRoleId) {
    return { success: false, error: "Please select a committee and role" }
  }

  // Check for duplicate
  const existing = await db.volunteer.findFirst({
    where: {
      memberId,
      ...(ministryId ? { ministryId } : { eventId }),
    },
  })
  if (existing) {
    return {
      success: false,
      error: "You're already registered as a volunteer here",
    }
  }

  try {
    const volunteer = await db.volunteer.create({
      data: {
        memberId,
        ministryId: ministryId ?? null,
        eventId: eventId ?? null,
        committeeId,
        preferredRoleId,
        notes: notes.trim() || null,
        leaderApprovalToken: crypto.randomUUID(),
        status: "Pending",
      },
      select: { id: true },
    })
    return { success: true, data: { id: volunteer.id } }
  } catch {
    return { success: false, error: "Failed to submit your application. Please try again." }
  }
}
