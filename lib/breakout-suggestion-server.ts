import "server-only"

import type { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import type { BreakoutCandidate } from "@/lib/breakout-suggestion"
import { ENABLED_BREAKOUT_WHERE } from "@/lib/breakouts/candidate-pool"
import { breakoutOccupancy } from "@/lib/breakouts/occupancy"
import { deriveEffectiveGenderFocus } from "@/lib/breakouts/gender-focus"

/**
 * The facilitator gate: a breakout group is only offered at a staffed surface
 * (the walk-in kiosk) once someone who runs it is actually in the room.
 *
 * "In the room" means checked in on the volunteer lane — see below; reading only
 * the registrant lane is what made this gate hold every group back forever.
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
  // A facilitator is checked in *as a volunteer*. The kiosk resolves them to
  // their `Volunteer` row and records attendance there — an `OccurrenceAttendee`
  // carrying `volunteerId` for session events, `Volunteer.attendedAt` for
  // OneTime (`recordCheckinAttendance`). This is the lane that actually fills.
  const volunteerCheckedIn: Prisma.VolunteerWhereInput =
    occurrenceId !== null
      ? { occurrenceAttendances: { some: { occurrenceId } } }
      : { attendedAt: { not: null } }

  // The registrant lane, kept as a fallback rather than replaced. It is the only
  // thing this gate used to look at, which is the bug: `OccurrenceAttendee`
  // holds *either* a registrantId or a volunteerId and a volunteer is never a
  // registrant, so a facilitator who checked in normally never matched and every
  // group stayed held back forever. Events where a facilitator happens to also
  // hold an EventRegistrant row (hand-added, or imported) still pass.
  const registrantCheckedIn: Prisma.VolunteerWhereInput =
    occurrenceId !== null
      ? {
          member: {
            eventRegistrations: {
              some: { eventId, occurrenceAttendances: { some: { occurrenceId } } },
            },
          },
        }
      : { member: { eventRegistrations: { some: { eventId, attendedAt: { not: null } } } } }

  const checkedIn: Prisma.VolunteerWhereInput = {
    OR: [volunteerCheckedIn, registrantCheckedIn],
  }

  return {
    OR: [
      { facilitator: checkedIn },
      { coFacilitator: checkedIn },
      // Per-occurrence stand-ins only — there is no such thing for OneTime.
      //
      // Deliberately the one branch that does NOT require a check-in, and it
      // reads like a bug until you see why (CCF-76 pins it): naming a stand-in
      // is a manual act an admin takes on the session screen, in the moment,
      // about a group they can see. That is explicit human intent, and intent
      // outranks the gate here for the same reason it does at the door — where
      // an explicit breakout pick is honoured while automatic placement is not.
      // The gate exists to stop people being sent somewhere *nobody chose*.
      //
      // Don't "fix" this to require attendance without changing CCF-76 first.
      ...(occurrenceId !== null
        ? [{ subFacilitators: { some: { occurrenceId } } } as const]
        : []),
    ],
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
      ...ENABLED_BREAKOUT_WHERE,
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
      // Not for display — a group's gender focus is often left blank and implied
      // by who runs it, and both the picker and the suggester have to see the
      // same focus the admin surfaces do. See `deriveEffectiveGenderFocus`.
      facilitator: { select: { member: { select: { gender: true } } } },
      coFacilitator: { select: { member: { select: { gender: true } } } },
      linkedSmallGroup: { select: { genderFocus: true } },
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
      genderFocus: deriveEffectiveGenderFocus(
        g.genderFocus,
        g.facilitator?.member.gender,
        g.coFacilitator?.member.gender,
        g.linkedSmallGroup?.genderFocus
      ),
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
  /**
   * The event's *enabled* breakout groups, before the facilitator gate.
   *
   * Switched-off groups are excluded because this number exists to explain an
   * empty picker to a member of the public, and "your table hosts haven't
   * arrived yet" is the wrong explanation when an admin has deliberately taken
   * every group out of play. Counting only enabled groups makes an all-off event
   * indistinguishable from an event with no groups — which is what off means on
   * a public route. The admin-side `breakoutPickerReadiness` keeps the ungated
   * count instead, because there the difference is the whole point.
   */
  totalGroups: number
}

/**
 * `fetchBreakoutCandidates` plus the enabled group count.
 *
 * Rendering surfaces need both to tell two very different empty states apart:
 * "this event has nothing to offer" (nothing to say — drop the step) versus
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
    db.breakoutGroup.count({ where: { eventId, ...ENABLED_BREAKOUT_WHERE } }),
  ])
  return { candidates, totalGroups }
}

export type BreakoutPickerReadiness = {
  totalGroups: number
  /** Of those, the ones still switched on — a disabled group is never offered. */
  enabledGroups: number
  /**
   * Enabled groups with a facilitator or co-facilitator assigned — the rest can
   * never pass the gate.
   */
  staffedGroups: number
}

/**
 * Admin-side counterpart to the gate: what the form builder needs in order to
 * warn that an enabled Breakout step will not actually render.
 *
 * "Staffed" here means *assigned*, not checked in — check-in is a runtime fact
 * that changes during the event, whereas an unstaffed group is a standing
 * configuration problem the admin can fix now.
 *
 * Three figures rather than two because switching groups off is a third way to
 * empty the picker, and it has a different fix from the other two. `totalGroups`
 * stays deliberately ungated so "you have no groups" and "you have groups but
 * they're all off" can be told apart.
 */
export async function breakoutPickerReadiness(
  eventId: string
): Promise<BreakoutPickerReadiness> {
  const [totalGroups, enabledGroups, staffedGroups] = await Promise.all([
    db.breakoutGroup.count({ where: { eventId } }),
    db.breakoutGroup.count({ where: { eventId, ...ENABLED_BREAKOUT_WHERE } }),
    db.breakoutGroup.count({
      where: {
        eventId,
        ...ENABLED_BREAKOUT_WHERE,
        OR: [{ facilitatorId: { not: null } }, { coFacilitatorId: { not: null } }],
      },
    }),
  ])
  return { totalGroups, enabledGroups, staffedGroups }
}
