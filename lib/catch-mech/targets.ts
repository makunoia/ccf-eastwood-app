/**
 * Resolves which small groups a Catch Mech facilitator can absorb participants into.
 *
 * Pure (no DB) so both the public form page and the submit action derive the same
 * answer from the same session shape — if they disagree, a faci sees a picker whose
 * choices the server then rejects.
 */

export type CandidateGroup = { id: string; name: string }

export type CatchMechSessionShape = {
  facilitatorVolunteerId: string
  breakoutGroup: {
    facilitatorId: string | null
    linkedSmallGroup: CandidateGroup | null
  }
  facilitator: {
    member: {
      // Ordered by createdAt asc — declineGroupId falls back to the earliest.
      ledGroups: CandidateGroup[]
    }
  }
}

export type CatchMechTargets = {
  /**
   * Groups this faci may confirm someone into, linked group first (the picker's
   * default). Empty means the faci is a Timothy who must name a group first.
   */
  candidates: CandidateGroup[]
  /**
   * Group a decline is recorded against. Declining is "none of my groups", so the
   * faci is never asked to pick — the request just needs somewhere to hang. Null
   * when the faci leads no group at all, which is the one groupless-decline case.
   */
  declineGroupId: string | null
}

export function resolveCatchMechTargets(session: CatchMechSessionShape): CatchMechTargets {
  // The breakout's linked group belongs to the LEAD faci. A co-faci absorbs into
  // their OWN group, so they ignore the link entirely.
  const isLeadFaci = session.facilitatorVolunteerId === session.breakoutGroup.facilitatorId
  const link = isLeadFaci ? session.breakoutGroup.linkedSmallGroup : null
  const led = session.facilitator.member.ledGroups

  const candidates = [...led]
  if (link) {
    // Linked group leads the list so it becomes the picker's default. It may not be
    // one the faci leads — an admin link is still a valid destination.
    const existing = candidates.findIndex((g) => g.id === link.id)
    if (existing >= 0) candidates.splice(existing, 1)
    candidates.unshift(link)
  }

  return {
    candidates,
    declineGroupId: link?.id ?? led[0]?.id ?? null,
  }
}
