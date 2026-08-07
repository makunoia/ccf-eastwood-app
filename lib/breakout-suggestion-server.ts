import "server-only"

import type { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import type { BreakoutCandidate } from "@/lib/breakout-suggestion"
import { breakoutOccupancy } from "@/lib/breakouts/occupancy"

/**
 * The facilitator gate: a breakout group is only offered at a staffed surface
 * (the walk-in kiosk) once someone who runs it is actually in the room.
 *
 * Note that every branch requires a facilitator relation to exist, so a group
 * with `facilitatorId` and `coFacilitatorId` both null matches nothing and is
 * never offered. That is deliberate — an unstaffed group has nobody to hand the
 * walk-in over to. It is also the single most confusing thing about this query,
 * which is why `breakoutPickerReadiness` exists to surface it to admins.
 */
function facilitatorGate(
  eventId: string,
  occurrenceId: string | null
): Prisma.BreakoutGroupWhereInput {
  const checkedInHere = (occurrenceId: string) => ({
    member: {
      eventRegistrations: {
        some: { eventId, occurrenceAttendances: { some: { occurrenceId } } },
      },
    },
  })
  const checkedInAtAll = {
    member: { eventRegistrations: { some: { eventId, attendedAt: { not: null } } } },
  }

  if (occurrenceId !== null) {
    return {
      OR: [
        { facilitator: checkedInHere(occurrenceId) },
        { coFacilitator: checkedInHere(occurrenceId) },
        { subFacilitators: { some: { occurrenceId } } },
      ],
    }
  }
  return {
    OR: [{ facilitator: checkedInAtAll }, { coFacilitator: checkedInAtAll }],
  }
}

export async function fetchBreakoutCandidates(
  eventId: string,
  occurrenceId: string | null,
  requireCheckedIn = true
): Promise<BreakoutCandidate[]> {
  const groups = await db.breakoutGroup.findMany({
    where: {
      eventId,
      ...(requireCheckedIn ? facilitatorGate(eventId, occurrenceId) : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      genderFocus: true,
      ageRangeMin: true,
      ageRangeMax: true,
      memberLimit: true,
      _count: { select: { members: true } },
    },
  })

  return groups.map((g) => {
    const occupancy = breakoutOccupancy({
      memberCount: g._count.members,
      memberLimit: g.memberLimit,
    })
    return {
      id: g.id,
      name: g.name,
      genderFocus: g.genderFocus,
      ageRangeMin: g.ageRangeMin,
      ageRangeMax: g.ageRangeMax,
      isFull: occupancy.isFull,
      // remaining/limit — the same figure the old inline `score` used.
      roomRatio:
        occupancy.remaining == null || g.memberLimit == null || g.memberLimit === 0
          ? null
          : occupancy.remaining / g.memberLimit,
      occupancy: { memberCount: occupancy.memberCount, memberLimit: occupancy.memberLimit },
    }
  })
}

export type BreakoutAvailability = {
  candidates: BreakoutCandidate[]
  /** Breakout groups on the event before the facilitator gate is applied. */
  totalGroups: number
}

/**
 * `fetchBreakoutCandidates` plus the ungated group count.
 *
 * Rendering surfaces need both to tell two very different empty states apart:
 * "this event has no breakout groups" (nothing to say — drop the step) versus
 * "it has groups but none is staffed right now" (say so — the person at the
 * kiosk is otherwise looking at a step that silently vanished).
 */
export async function fetchBreakoutAvailability(
  eventId: string,
  occurrenceId: string | null,
  requireCheckedIn = true
): Promise<BreakoutAvailability> {
  const [candidates, totalGroups] = await Promise.all([
    fetchBreakoutCandidates(eventId, occurrenceId, requireCheckedIn),
    db.breakoutGroup.count({ where: { eventId } }),
  ])
  return { candidates, totalGroups }
}

export type BreakoutPickerReadiness = {
  totalGroups: number
  /** Groups with a facilitator or co-facilitator assigned — the rest can never pass the gate. */
  staffedGroups: number
}

/**
 * Admin-side counterpart to the gate: what the form builder needs in order to
 * warn that an enabled Breakout step will not actually render.
 *
 * "Staffed" here means *assigned*, not checked in — check-in is a runtime fact
 * that changes during the event, whereas an unstaffed group is a standing
 * configuration problem the admin can fix now.
 */
export async function breakoutPickerReadiness(
  eventId: string
): Promise<BreakoutPickerReadiness> {
  const [totalGroups, staffedGroups] = await Promise.all([
    db.breakoutGroup.count({ where: { eventId } }),
    db.breakoutGroup.count({
      where: {
        eventId,
        OR: [{ facilitatorId: { not: null } }, { coFacilitatorId: { not: null } }],
      },
    }),
  ])
  return { totalGroups, staffedGroups }
}
