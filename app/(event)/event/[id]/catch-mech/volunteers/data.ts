import { db } from "@/lib/db"
import { resolveSubmissionDecisions } from "@/lib/catch-mech/submission-detail"
import { resolveCatchMechScope } from "@/lib/catch-mech/scope"
import type {
  VolunteerFollowUpNonResponder,
  VolunteerFollowUpSubmission,
} from "./volunteer-follow-up-client"

/**
 * Reads each volunteer's submission back into the people it decided on.
 *
 * Lives beside the page rather than in it so the resolution is testable — a
 * Next.js page module may only export its own reserved names. The parsing of the
 * raw JSON itself is shared with the facilitator submissions page, in
 * `lib/catch-mech/stored-decisions.ts`.
 */
export type VolunteerFollowUpData = {
  submissions: VolunteerFollowUpSubmission[]
  nonResponders: VolunteerFollowUpNonResponder[]
  committees: string[]
}

export async function getVolunteerFollowUpData(
  eventId: string
): Promise<VolunteerFollowUpData | null> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      modules: { select: { type: true } },
      volunteers: {
        where: { status: "Confirmed" },
        orderBy: { member: { lastName: "asc" } },
        select: {
          id: true,
          committee: { select: { name: true } },
          assignedRole: { select: { name: true } },
          preferredRole: { select: { name: true } },
          member: { select: { firstName: true, lastName: true } },
        },
      },
    },
  })
  if (!event || !event.modules.some((module) => module.type === "CatchMech")) return null

  const submissions = await db.confirmationSubmission.findMany({
    where: { eventId, source: "CatchMechVolunteer" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      facilitatorVolunteerId: true,
      submittedByName: true,
      confirmedCount: true,
      createdAt: true,
      decisions: true,
    },
  })

  const decisionsBySubmission = await resolveSubmissionDecisions(submissions)

  // Resolved by id, NOT from `event.volunteers` — that list is filtered to
  // Confirmed, so an admin later flipping a volunteer to Pending or Rejected
  // would make their whole submission disappear from the one page that shows it,
  // while the people they absorbed stay in the DGroup. A response, once given,
  // is history and outlives the status that let them give it.
  const submitterIds = [
    ...new Set(
      submissions
        .map((submission) => submission.facilitatorVolunteerId)
        .filter((id): id is string => id !== null)
    ),
  ]
  const submitters = submitterIds.length > 0
    ? await db.volunteer.findMany({
        where: { id: { in: submitterIds } },
        select: {
          id: true,
          committee: { select: { name: true } },
          assignedRole: { select: { name: true } },
          preferredRole: { select: { name: true } },
        },
      })
    : []

  const volunteers = new Map(submitters.map((volunteer) => [volunteer.id, volunteer]))
  const responseRows: VolunteerFollowUpSubmission[] = submissions.flatMap((submission) => {
    if (!submission.facilitatorVolunteerId) return []
    const volunteer = volunteers.get(submission.facilitatorVolunteerId)
    if (!volunteer) return []
    return [{
      id: submission.id,
      volunteerId: volunteer.id,
      volunteerName: submission.submittedByName,
      committeeName: volunteer.committee.name,
      roleName: volunteer.assignedRole?.name ?? volunteer.preferredRole.name,
      placedCount: submission.confirmedCount,
      decisions: decisionsBySubmission.get(submission.id) ?? [],
      createdAt: submission.createdAt,
    }]
  })

  // Facilitators answer the facilitator form — the volunteer entry now redirects
  // them there — so they are not waiting on a volunteer response and must not be
  // chased for one.
  const scope = await resolveCatchMechScope(eventId)
  const staffingGroups = await db.breakoutGroup.findMany({
    where: scope.where,
    select: {
      facilitatorId: true,
      coFacilitatorId: true,
      subFacilitators: { select: { substituteId: true } },
    },
  })
  const staffingVolunteerIds = new Set(
    staffingGroups.flatMap((group) => [
      ...[group.facilitatorId, group.coFacilitatorId].filter((id): id is string => id !== null),
      ...group.subFacilitators.map((slot) => slot.substituteId),
    ])
  )

  const respondedIds = new Set(responseRows.map((submission) => submission.volunteerId))
  const nonResponders: VolunteerFollowUpNonResponder[] = event.volunteers
    .filter(
      (volunteer) => !respondedIds.has(volunteer.id) && !staffingVolunteerIds.has(volunteer.id)
    )
    .map((volunteer) => ({
      id: volunteer.id,
      volunteerName: `${volunteer.member.firstName} ${volunteer.member.lastName}`,
      committeeName: volunteer.committee.name,
      roleName: volunteer.assignedRole?.name ?? volunteer.preferredRole.name,
    }))

  return {
    submissions: responseRows,
    nonResponders,
    committees: [
      ...new Set([
        ...event.volunteers.map((volunteer) => volunteer.committee.name),
        ...responseRows.map((submission) => submission.committeeName),
      ]),
    ].sort(),
  }
}
