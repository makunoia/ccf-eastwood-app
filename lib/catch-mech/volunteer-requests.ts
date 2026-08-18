import { db } from "@/lib/db"
import { readStoredDecisions } from "@/lib/catch-mech/stored-decisions"

/**
 * Column label for a placement that came from the volunteer follow-up form
 * rather than a breakout table. Doubles as the filter value on the status list,
 * so the two must stay identical.
 */
export const VOLUNTEER_CHANNEL_LABEL = "Volunteer follow-up"

/**
 * The `SmallGroupMemberRequest` ids an event's non-facilitator volunteers raised
 * by absorbing participants into their own DGroup.
 *
 * Those requests carry `breakoutGroupId = null` — a volunteer has no breakout
 * table — so every breakout-scoped query on the Catch Mech screens misses them.
 * Nothing on the request row itself says "a volunteer did this": `origin` stays
 * `Assignment` and `declinedByVolunteerId` is only written on declines. The
 * `ConfirmationSubmission` written in the same transaction is the record, so we
 * read the channel back out of its `decisions` JSON, the same way the volunteer
 * follow-up page does.
 *
 * Matched on (person, destination group), not person alone: someone can also
 * hold an unrelated groupless request — a `RegistrationIntent` seeker row, say —
 * and that one did not come from this channel.
 *
 * A submission written before the decisions trail existed has no stored people,
 * so its placements stay unattributable. That is the same blind spot the
 * follow-up page already carries for those rows.
 */
export async function getVolunteerPlacementRequestIds(eventId: string): Promise<Set<string>> {
  const submissions = await db.confirmationSubmission.findMany({
    where: { eventId, source: "CatchMechVolunteer" },
    select: { decisions: true },
  })

  const decisions = submissions
    .flatMap((submission) => readStoredDecisions(submission.decisions))
    .filter((decision) => decision.status === "confirmed" && decision.smallGroupId)
  if (decisions.length === 0) return new Set()

  // A confirmed guest is promoted inside the submit transaction and their
  // registrant repointed onto the new Member, so reading the registrant now
  // gives the same person key the request row ended up with.
  const registrants = await db.eventRegistrant.findMany({
    where: { id: { in: [...new Set(decisions.map((decision) => decision.registrantId))] } },
    select: { id: true, memberId: true, guestId: true },
  })
  const registrantMap = new Map(registrants.map((registrant) => [registrant.id, registrant]))

  const memberIds = new Set<string>()
  const guestIds = new Set<string>()
  const placements = new Set<string>()
  for (const decision of decisions) {
    const registrant = registrantMap.get(decision.registrantId)
    if (!registrant) continue
    if (registrant.memberId) {
      memberIds.add(registrant.memberId)
      placements.add(`m:${registrant.memberId}|${decision.smallGroupId}`)
    } else if (registrant.guestId) {
      guestIds.add(registrant.guestId)
      placements.add(`g:${registrant.guestId}|${decision.smallGroupId}`)
    }
  }
  if (placements.size === 0) return new Set()

  const requests = await db.smallGroupMemberRequest.findMany({
    where: {
      breakoutGroupId: null,
      OR: [
        ...(memberIds.size > 0 ? [{ memberId: { in: [...memberIds] } }] : []),
        ...(guestIds.size > 0 ? [{ guestId: { in: [...guestIds] } }] : []),
      ],
    },
    select: { id: true, memberId: true, guestId: true, smallGroupId: true },
  })

  const matched = new Set<string>()
  for (const request of requests) {
    if (!request.smallGroupId) continue
    // Guard both-null before branching: `memberId ? … : { guestId }` on a row with
    // neither would fall into the guest arm and compare against null.
    const key = request.memberId
      ? `m:${request.memberId}`
      : request.guestId
        ? `g:${request.guestId}`
        : null
    if (!key) continue
    if (placements.has(`${key}|${request.smallGroupId}`)) matched.add(request.id)
  }
  return matched
}
