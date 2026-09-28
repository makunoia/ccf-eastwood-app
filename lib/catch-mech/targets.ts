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
   * Groups this faci leads. Empty means the faci is a Timothy who must name a
   * group first. Historical breakout-to-DGroup links are not destinations.
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
  const led = session.facilitator.member.ledGroups

  return {
    candidates: led,
    declineGroupId: led[0]?.id ?? null,
  }
}
