import "server-only"

import { db } from "@/lib/db"
import { deriveEffectiveGenderFocus } from "@/lib/matching"
import { resolvePoolScope } from "@/lib/events/pool-scope"
import {
  ownerOf,
  surfaceFor,
  type BreakoutSurface,
} from "./owner"

/**
 * Everything the registrant detail page's Breakout section needs, resolved
 * against the day the registrant is actually attending.
 *
 * The page used to ask three questions with a bare `eventId` — which tables
 * exist, which one this person facilitates, and where their seat links to — and
 * on a **Collab** day all three answered about the wrong set. A collab's tables
 * are cluster-owned and the member events' standing tables sit unused, so the
 * "assign to a group" list offered tables nobody would sit at while hiding every
 * table of the day; the facilitator badge never appeared; and the link under an
 * assigned seat pointed at `/event/<id>/breakouts/<cluster-owned id>`, which the
 * event workspace's own route scopes on `{ id, eventId }` and therefore 404s.
 *
 * Extracted from the page so the resolution is testable without rendering a
 * server component — the same reason `checkin-choices.ts` exists beside the
 * kiosk.
 */

/** One table offered for direct assignment. */
export type PlacementGroupOption = {
  id: string
  name: string
  memberLimit: number | null
  currentCount: number
}

/** A seat the registrant already holds, with the route that actually serves it. */
export type PlacementSeat = {
  id: string
  name: string
  /** `/event/<id>/breakouts/<id>` or `/cluster/<id>/breakouts/<id>`. */
  href: string
}

export type RegistrantPlacement = {
  /** Owner + route base for the tables in play — the cluster's under a Collab. */
  surface: BreakoutSurface
  seats: PlacementSeat[]
  facilitatedGroup: { id: string; name: string } | null
  availableGroups: PlacementGroupOption[]
}

/**
 * The workspace route that serves a group's detail page.
 *
 * Derived from the **group's own** owner columns rather than from the page's
 * scope, because the two can legitimately disagree: a person may still hold a
 * seat at their member event's standing table from before the collab day, and
 * that seat's page lives in the event workspace even while the day's tables live
 * in the cluster's. Answering from the row is what makes both links land.
 */
export function breakoutGroupHref(group: {
  id: string
  eventId: string | null
  clusterId: string | null
}): string | null {
  const owner = ownerOf(group)
  if (!owner) return null
  return `${surfaceFor(owner).basePath}/breakouts/${group.id}`
}

/**
 * The tables this registrant could be put in — every table the day's owner has,
 * minus the ones they already sit at, minus the ones their gender rules out.
 *
 * The gender filter mirrors the pickers': a table's focus is the one it declares,
 * or the one its facilitators and linked DGroup imply. A registrant with no
 * gender on file sees everything, because an unknown is not a mismatch.
 */
async function loadAvailableGroups(
  surface: BreakoutSurface,
  excludeIds: string[],
  registrantGender: "Male" | "Female" | null
): Promise<PlacementGroupOption[]> {
  const groups = await db.breakoutGroup.findMany({
    where: { ...surface.owner },
    select: {
      id: true,
      name: true,
      genderFocus: true,
      memberLimit: true,
      _count: { select: { members: true } },
      facilitator: { select: { member: { select: { gender: true } } } },
      coFacilitator: { select: { member: { select: { gender: true } } } },
      linkedSmallGroup: { select: { genderFocus: true } },
    },
    orderBy: { name: "asc" },
  })
  return groups
    .filter((g) => {
      if (excludeIds.includes(g.id)) return false
      if (!registrantGender) return true
      const effectiveFocus = deriveEffectiveGenderFocus(
        g.genderFocus,
        g.facilitator?.member.gender ?? null,
        g.coFacilitator?.member.gender ?? null,
        g.linkedSmallGroup?.genderFocus
      )
      if (!effectiveFocus || effectiveFocus === "Mixed") return true
      return effectiveFocus === registrantGender
    })
    .map((g) => ({
      id: g.id,
      name: g.name,
      memberLimit: g.memberLimit,
      currentCount: g._count.members,
    }))
}

/**
 * The table this member staffs, if any.
 *
 * Scoped on the two halves of the pool separately, which is the asymmetry
 * `lib/events/pool-scope.ts` exists to express: the **group** must belong to the
 * day's owner, but the **volunteer row** stays owned by whichever member event
 * the person signed up under — under a Collab that is either ministry's, so the
 * roster is the union rather than this registrant's own event.
 */
async function loadFacilitatedGroup(
  memberId: string,
  surface: BreakoutSurface,
  volunteerEventIds: string[]
) {
  return db.breakoutGroup.findFirst({
    where: {
      ...surface.owner,
      OR: [
        { facilitator: { memberId, eventId: { in: volunteerEventIds } } },
        { coFacilitator: { memberId, eventId: { in: volunteerEventIds } } },
      ],
    },
    select: { id: true, name: true },
  })
}

export async function getRegistrantPlacement(registrant: {
  id: string
  eventId: string
  memberId: string | null
  gender: "Male" | "Female" | null
}): Promise<RegistrantPlacement> {
  const scope = await resolvePoolScope(registrant.eventId)
  const surface = surfaceFor(scope.breakoutOwner)

  const memberships = await db.breakoutGroupMember.findMany({
    where: { registrantId: registrant.id },
    select: {
      breakoutGroup: {
        select: { id: true, name: true, eventId: true, clusterId: true },
      },
    },
  })
  const groups = memberships.map((m) => m.breakoutGroup)
  const seats = groups.flatMap((g) => {
    const href = breakoutGroupHref(g)
    return href ? [{ id: g.id, name: g.name, href }] : []
  })

  const [facilitatedGroup, availableGroups] = await Promise.all([
    registrant.memberId
      ? loadFacilitatedGroup(registrant.memberId, surface, scope.volunteerEventIds)
      : null,
    loadAvailableGroups(
      surface,
      groups.map((g) => g.id),
      registrant.gender
    ),
  ])

  return { surface, seats, facilitatedGroup, availableGroups }
}
