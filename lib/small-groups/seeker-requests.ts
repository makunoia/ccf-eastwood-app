import { db } from "@/lib/db"
import type { PersonRef } from "@/lib/events/registration-core"

/**
 * "I want to join a DGroup" at event registration (CCF-101).
 *
 * The checkbox used to be purely a UI gate: ticking it revealed the matching
 * questions and was then thrown away on submit. The answers were stored on the
 * Guest/Member profile, but the *intent* went nowhere — nobody was told that a
 * real person had asked to be placed, so the request quietly died at the form.
 *
 * It now creates a `SmallGroupMemberRequest` with no target group and
 * `origin = RegistrationIntent`. That is deliberately a different shape from every
 * other request: the existing ones name the group they're asking to join, whereas
 * this one is a person asking to be matched *to* a group that hasn't been chosen
 * yet. Admins triage these on DGroups → Requests, where the matching engine can
 * suggest a group from the profile the same form just captured.
 *
 * No `SmallGroupLog` entry accompanies it — that table is scoped to a group, and
 * a seeker has none yet. The log picks the story up when the request is resolved
 * into an actual placement.
 */

/** A Pending, groupless request raised by someone's registration intent. */
export const SEEKER_REQUEST_WHERE = {
  origin: "RegistrationIntent",
  status: "Pending",
  smallGroupId: null,
} as const

type SeekerResult =
  | { created: true; requestId: string }
  | { created: false; reason: "duplicate" | "already-requested" | "promoted-guest" | "error" }

/**
 * Raise a seeker request for the person who just registered, unless one would be
 * redundant.
 *
 * Never throws: a registration must complete even if this bookkeeping fails. The
 * caller has already taken the person's money and attendance by this point, so
 * failing the whole submission over a follow-up record would be the worse bug.
 */
export async function createSeekerRequestFromRegistration(
  person: PersonRef,
  eventId: string
): Promise<SeekerResult> {
  try {
    const personWhere =
      "memberId" in person ? { memberId: person.memberId } : { guestId: person.guestId }

    // A guest already promoted to a member is represented by that member; their
    // requests hang off the member record, so skip rather than create an orphan
    // against the stale guest.
    if ("guestId" in person) {
      const guest = await db.guest.findUnique({
        where: { id: person.guestId },
        select: { memberId: true },
      })
      if (guest?.memberId) return { created: false, reason: "promoted-guest" }
    }

    // Any open request already means an admin has this person in the queue —
    // whether they're seeking, or someone has already picked a group for them.
    // A second row would just be noise on the same screen.
    const existing = await db.smallGroupMemberRequest.findFirst({
      where: { ...personWhere, status: "Pending" },
      select: { id: true, smallGroupId: true },
    })
    if (existing) {
      return {
        created: false,
        reason: existing.smallGroupId ? "already-requested" : "duplicate",
      }
    }

    const request = await db.smallGroupMemberRequest.create({
      data: {
        ...personWhere,
        smallGroupId: null,
        status: "Pending",
        origin: "RegistrationIntent",
        sourceEventId: eventId,
      },
      select: { id: true },
    })
    return { created: true, requestId: request.id }
  } catch {
    // Never propagate — registration must not fail over a follow-up record.
    return { created: false, reason: "error" }
  }
}

/** How many people are waiting to be matched to a group. Drives the tab badge. */
export function countSeekerRequests(): Promise<number> {
  return db.smallGroupMemberRequest.count({ where: SEEKER_REQUEST_WHERE })
}
