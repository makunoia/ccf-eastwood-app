import { db } from "@/lib/db"

/** Confirms the committee and both roles belong to the selected event. */
export async function hasValidVolunteerAssignment(
  eventId: string,
  committeeId: string,
  preferredRoleId: string,
  assignedRoleId?: string | null
): Promise<boolean> {
  const roles = await db.committeeRole.findMany({
    where: {
      committeeId,
      committee: { eventId },
      id: { in: [preferredRoleId, ...(assignedRoleId ? [assignedRoleId] : [])] },
    },
    select: { id: true },
  })
  const ids = new Set(roles.map((role) => role.id))
  return ids.has(preferredRoleId) && (!assignedRoleId || ids.has(assignedRoleId))
}
