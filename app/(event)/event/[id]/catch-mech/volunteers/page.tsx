import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import {
  VolunteerFollowUpClient,
  type VolunteerFollowUpNonResponder,
  type VolunteerFollowUpSubmission,
} from "./volunteer-follow-up-client"

async function getVolunteerFollowUpData(eventId: string) {
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
    },
  })
  const volunteers = new Map(event.volunteers.map((volunteer) => [volunteer.id, volunteer]))
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
      createdAt: submission.createdAt,
    }]
  })
  const respondedIds = new Set(responseRows.map((submission) => submission.volunteerId))
  const nonResponders: VolunteerFollowUpNonResponder[] = event.volunteers
    .filter((volunteer) => !respondedIds.has(volunteer.id))
    .map((volunteer) => ({
      id: volunteer.id,
      volunteerName: `${volunteer.member.firstName} ${volunteer.member.lastName}`,
      committeeName: volunteer.committee.name,
      roleName: volunteer.assignedRole?.name ?? volunteer.preferredRole.name,
    }))

  return {
    submissions: responseRows,
    nonResponders,
    committees: [...new Set(event.volunteers.map((volunteer) => volunteer.committee.name))].sort(),
  }
}

export default async function CatchMechVolunteerFollowUpPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getVolunteerFollowUpData(id)
  if (!data) notFound()

  return (
    <div className="flex flex-1 flex-col p-6">
      <VolunteerFollowUpClient eventId={id} {...data} />
    </div>
  )
}
