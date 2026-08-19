import { db } from "@/lib/db"
import { resolveCatchMechScope } from "@/lib/catch-mech/scope"

/**
 * Who may answer for a breakout table, and the session that lets them.
 *
 * Shared by the two public entry points — the facilitator form's own
 * verification and the volunteer form's redirect — so the two can never disagree
 * about who counts as staffing a table or hand out two different sessions for
 * the same person.
 */

/** The three ways a volunteer can be attached to a table, in precedence order. */
export type StaffingRoles = {
  facilitator: { id: string; memberId: string } | null
  coFacilitator: { id: string; memberId: string } | null
  subFacilitators: { substitute: { id: string; memberId: string } }[]
}

/** Select fragment matching {@link StaffingRoles}. */
export const STAFFING_SELECT = {
  facilitator: { select: { id: true, memberId: true } },
  coFacilitator: { select: { id: true, memberId: true } },
  subFacilitators: { select: { substitute: { select: { id: true, memberId: true } } } },
} as const

/**
 * The volunteer row this member holds on this table, or null if they hold none.
 *
 * Lead wins over co-faci wins over substitute: somebody standing in for a table
 * they also lead should act as the lead, because that is the role that owns the
 * table's linked DGroup in `resolveCatchMechTargets`.
 *
 * Pure — no DB — so the precedence is unit-testable on its own.
 */
export function staffVolunteerFor(
  group: StaffingRoles,
  memberId: string
): { id: string } | null {
  if (group.facilitator?.memberId === memberId) return group.facilitator
  if (group.coFacilitator?.memberId === memberId) return group.coFacilitator
  return (
    group.subFacilitators.find((slot) => slot.substitute.memberId === memberId)?.substitute ??
    null
  )
}

export type StaffedTable = {
  breakoutGroupId: string
  name: string
  faciVolunteerId: string
}

/**
 * Every table in this event's Catch Mech scope that the member staffs.
 *
 * Used by the volunteer form to decide whether the person in front of it is
 * really a facilitator who should be answering the other form instead.
 */
export async function findStaffedTables(
  eventId: string,
  memberId: string
): Promise<StaffedTable[]> {
  const scope = await resolveCatchMechScope(eventId)
  const groups = await db.breakoutGroup.findMany({
    // AND, not a spread: the Collab scope is itself an OR over staffing roles.
    where: {
      AND: [
        scope.where,
        {
          OR: [
            { facilitator: { memberId } },
            { coFacilitator: { memberId } },
            { subFacilitators: { some: { substitute: { memberId } } } },
          ],
        },
      ],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, ...STAFFING_SELECT },
  })

  return groups.flatMap((group) => {
    const volunteer = staffVolunteerFor(group, memberId)
    return volunteer
      ? [{ breakoutGroupId: group.id, name: group.name, faciVolunteerId: volunteer.id }]
      : []
  })
}

/**
 * One session per volunteer+table, idempotent — reopening the form must not mint
 * a second link, or a facilitator ends up holding two and only one shows their
 * earlier answers.
 */
export async function mintFaciSession(
  eventId: string,
  breakoutGroupId: string,
  faciVolunteerId: string
): Promise<string> {
  const existing = await db.catchMechSession.findFirst({
    where: { facilitatorVolunteerId: faciVolunteerId, breakoutGroupId },
    select: { token: true },
  })
  if (existing) return existing.token

  const session = await db.catchMechSession.create({
    data: { eventId, breakoutGroupId, facilitatorVolunteerId: faciVolunteerId },
    select: { token: true },
  })
  return session.token
}
