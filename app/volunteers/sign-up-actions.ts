"use server"

import { db } from "@/lib/db"
import { formatPhilippinePhone } from "@/lib/utils"
import { ageGroupForBirthDate } from "@/lib/volunteers/age-groups"
import { hasValidVolunteerAssignment } from "@/lib/volunteers/role-validation"

export async function lookupMemberByMobile(mobile: string): Promise<{
  id: string
  firstName: string
  lastName: string
  email: string | null
} | null> {
  const member = await db.member.findFirst({
    where: { phone: formatPhilippinePhone(mobile.trim()) },
    select: { id: true, firstName: true, lastName: true, email: true },
  })
  return member
}

type SignUpInput = {
  memberId: string
  eventId: string
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
  const { memberId, eventId, committeeId, preferredRoleId, notes } = input

  if (!eventId) {
    return { success: false, error: "Invalid sign-up context" }
  }
  if (!committeeId || !preferredRoleId) {
    return { success: false, error: "Please select a committee and role" }
  }
  if (!await hasValidVolunteerAssignment(eventId, committeeId, preferredRoleId)) {
    return { success: false, error: "Please select a valid committee and role." }
  }

  const existing = await db.volunteer.findFirst({
    where: { memberId, eventId },
  })
  if (existing) {
    return {
      success: false,
      error: "You're already registered as a volunteer for this event",
    }
  }

  try {
    const member = await db.member.findUnique({
      where: { id: memberId },
      select: { birthMonth: true, birthYear: true, lifeStageId: true },
    })
    if (!member) return { success: false, error: "We couldn't find your member record." }
    const volunteer = await db.volunteer.create({
      data: {
        memberId,
        eventId,
        committeeId,
        preferredRoleId,
        ageGroup: ageGroupForBirthDate(member.birthYear, member.birthMonth),
        lifeStageId: member.lifeStageId,
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
