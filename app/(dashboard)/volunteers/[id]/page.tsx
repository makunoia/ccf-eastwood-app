import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { VolunteerForm } from "../volunteer-form"

async function getData(id: string) {
  const [volunteer, members, ministries, events] = await Promise.all([
    db.volunteer.findUnique({
      where: { id },
      include: {
        member: { select: { firstName: true, lastName: true } },
        ministry: { select: { name: true } },
        event: { select: { name: true } },
        committee: { select: { name: true } },
        preferredRole: { select: { name: true } },
        assignedRole: { select: { name: true } },
      },
    }),
    db.member.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    db.ministry.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        committees: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            roles: {
              orderBy: { createdAt: "asc" },
              select: { id: true, name: true },
            },
          },
        },
      },
    }),
    db.event.findMany({
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        name: true,
        committees: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            roles: {
              orderBy: { createdAt: "asc" },
              select: { id: true, name: true },
            },
          },
        },
      },
    }),
  ])
  return { volunteer, members, ministries, events }
}

export default async function EditVolunteerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { volunteer, members, ministries, events } = await getData(id)

  if (!volunteer) notFound()

  const scopeType: "ministry" | "event" = volunteer.ministryId ? "ministry" : "event"

  const volunteerProp = {
    id: volunteer.id,
    memberName: `${volunteer.member.firstName} ${volunteer.member.lastName}`,
    scope: volunteer.ministry
      ? `Ministry: ${volunteer.ministry.name}`
      : `Event: ${volunteer.event?.name ?? ""}`,
    committee: volunteer.committee.name,
    preferredRole: volunteer.preferredRole.name,
    assignedRole: volunteer.assignedRole?.name ?? null,
    status: volunteer.status as "Pending" | "Confirmed" | "Rejected",
    memberId: volunteer.memberId,
    scopeType,
    ministryId: volunteer.ministryId,
    eventId: volunteer.eventId,
    committeeId: volunteer.committeeId,
    preferredRoleId: volunteer.preferredRoleId,
    assignedRoleId: volunteer.assignedRoleId,
    notes: volunteer.notes,
    leaderApprovalToken: volunteer.leaderApprovalToken,
    leaderNotes: volunteer.leaderNotes,
  }

  return (
    <VolunteerForm
      members={members}
      ministries={ministries}
      events={events}
      volunteer={volunteerProp}
    />
  )
}
