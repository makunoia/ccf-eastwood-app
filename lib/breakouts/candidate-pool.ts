import type { Prisma } from "@/app/generated/prisma/client"

/**
 * Who is eligible to be placed into one of an event's breakout groups.
 *
 * Two rules, both scoped to the event:
 *  1. Not already in a breakout group.
 *  2. Not a facilitator or co-facilitator of any breakout group in this event
 *     (CCF-87 — they run a table, they don't sit at one).
 *
 * Note this is *not* "excludes all volunteers". A confirmed volunteer who isn't
 * facilitating a table is a normal participant and stays in the pool. The
 * breakouts list page used to exclude every confirmed volunteer while the group
 * detail page and `autoAssignBreakouts` excluded only facilitators, so the
 * "N unassigned" count disagreed with the list you could actually pick from.
 * All three now share this clause.
 *
 * Deliberately not scoped by `volunteers.status`: a Pending or Rejected
 * volunteer who is still attached as a facilitator is excluded too. That was the
 * pre-existing behavior and changing it is a separate decision.
 */
/**
 * The other half of eligibility: which *groups* may still receive someone
 * without an admin explicitly putting them there.
 *
 * Spelled as a shared constant because it has to hold identically in three
 * queries that otherwise share nothing — the public/walk-in picker
 * (`fetchBreakoutCandidates`), the scorer (`matchBreakoutGroups`) and the
 * registration write (`assignBreakoutForRegistrant`). A group that is off in one
 * of them and on in another is the bug this prevents.
 *
 * Deliberately *not* applied to the admin add/transfer paths: switching a group
 * off aims at the automatic and public routes, not at staff judgment.
 */
export const ENABLED_BREAKOUT_WHERE = { isEnabled: true } as const satisfies Prisma.BreakoutGroupWhereInput

export function unassignedCandidateWhere(eventId: string): Prisma.EventRegistrantWhereInput {
  return {
    breakoutGroupMemberships: { none: {} },
    NOT: {
      member: {
        volunteers: {
          some: {
            OR: [
              { facilitatedGroups: { some: { eventId } } },
              { coFacilitatedGroups: { some: { eventId } } },
            ],
          },
        },
      },
    },
  }
}
