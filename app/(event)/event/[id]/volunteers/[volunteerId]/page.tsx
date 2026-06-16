import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { canRead } from "@/lib/permissions"
import { db } from "@/lib/db"
import { EventVolunteerDetail } from "./volunteer-detail"

async function getData(volunteerId: string, eventId: string) {
  const [volunteer, committees] = await Promise.all([
    db.volunteer.findFirst({
      where: { id: volunteerId, eventId },
      include: {
        member: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    db.volunteerCommittee.findMany({
      where: { eventId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        roles: {
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true },
        },
      },
    }),
  ])
  return { volunteer, committees }
}

export default async function EventVolunteerDetailPage({
  params,
}: {
  params: Promise<{ id: string; volunteerId: string }>
}) {
  const { id: eventId, volunteerId } = await params
  const { volunteer, committees } = await getData(volunteerId, eventId)
  if (!volunteer) notFound()

  const memberName = `${volunteer.member.firstName} ${volunteer.member.lastName}`

  const session = await auth()
  const canViewMember = canRead(session, "Members")

  return (
    <EventVolunteerDetail
      canViewMember={canViewMember}
      volunteer={{
        id: volunteer.id,
        memberId: volunteer.memberId,
        eventId: volunteer.eventId,
        memberName,
        memberId_link: volunteer.member.id,
        committeeId: volunteer.committeeId,
        preferredRoleId: volunteer.preferredRoleId,
        assignedRoleId: volunteer.assignedRoleId,
        status: volunteer.status as "Pending" | "Confirmed" | "Rejected",
        notes: volunteer.notes,
        leaderApprovalToken: volunteer.leaderApprovalToken,
        leaderNotes: volunteer.leaderNotes,
        committees,
      }}
    />
  )
}
