import { db } from "@/lib/db"
import {
  readStoredDecisions,
  type SubmissionDecision,
} from "@/lib/catch-mech/stored-decisions"

/**
 * Turns each submission's raw `decisions` JSON into a display-ready list of
 * people and outcomes.
 *
 * Batched across the whole page: two queries total, not two per submission —
 * an event with fifty facilitators would otherwise fan out to a hundred.
 *
 * Shared by the facilitator submissions page and the volunteer follow-up page
 * because the two differ only in which submissions they select.
 */
export async function resolveSubmissionDecisions(
  submissions: readonly { id: string; decisions: unknown }[]
): Promise<Map<string, SubmissionDecision[]>> {
  const stored = new Map(
    submissions.map((submission) => [submission.id, readStoredDecisions(submission.decisions)])
  )
  const all = [...stored.values()].flat()
  const registrantIds = [...new Set(all.map((decision) => decision.registrantId))]
  const groupIds = [
    ...new Set(all.map((d) => d.smallGroupId).filter((id): id is string => !!id)),
  ]

  const [registrants, groups] = await Promise.all([
    registrantIds.length > 0
      ? db.eventRegistrant.findMany({
          where: { id: { in: registrantIds } },
          select: {
            id: true,
            memberId: true,
            firstName: true,
            lastName: true,
            member: { select: { firstName: true, lastName: true } },
            guest: { select: { firstName: true, lastName: true } },
          },
        })
      : Promise.resolve([]),
    groupIds.length > 0
      ? db.smallGroup.findMany({
          where: { id: { in: groupIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ])

  const registrantMap = new Map(registrants.map((registrant) => [registrant.id, registrant]))
  const groupNames = new Map(groups.map((group) => [group.id, group.name]))

  const resolved = new Map<string, SubmissionDecision[]>()
  for (const [submissionId, decisions] of stored) {
    resolved.set(
      submissionId,
      decisions.map((decision) => {
        const registrant = registrantMap.get(decision.registrantId)
        // A confirmed guest is promoted inside the same transaction, so the
        // registrant now reads as a Member — that is the current truth, and the
        // memberId is what makes the name a working profile link.
        const person = registrant?.member ?? registrant?.guest
        const name = person
          ? `${person.firstName} ${person.lastName}`.trim()
          : [registrant?.firstName, registrant?.lastName].filter(Boolean).join(" ").trim()
        return {
          registrantId: decision.registrantId,
          name: name || "Unknown participant",
          memberId: registrant?.memberId ?? null,
          status: decision.status,
          declineReason: decision.declineReason,
          smallGroupId: decision.smallGroupId,
          smallGroupName: decision.smallGroupId
            ? (groupNames.get(decision.smallGroupId) ?? null)
            : null,
        }
      })
    )
  }
  return resolved
}
