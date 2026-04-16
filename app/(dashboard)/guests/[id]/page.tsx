import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { GuestForm } from "../guest-form"
import { GuestEventHistory } from "./guest-event-history"
import { GuestMatchSection } from "./guest-match-section"
import { computeGuestStatus } from "@/lib/guest-utils"

async function getGuest(id: string) {
  const [g, pendingRequest] = await Promise.all([
    db.guest.findUnique({
      where: { id },
      include: {
        lifeStage: { select: { id: true, name: true } },
        claimedSmallGroup: {
          select: {
            id: true,
            name: true,
            leader: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        eventRegistrations: {
          select: {
            attendedAt: true,
            occurrenceAttendances: { select: { id: true } },
            breakoutGroupMemberships: { select: { breakoutGroupId: true } },
          },
        },
      },
    }),
    db.smallGroupMemberRequest.findFirst({
      where: { guestId: id, status: "Pending" },
      select: { smallGroup: { select: { name: true } } },
    }),
  ])
  if (!g) return null
  return {
    id: g.id,
    firstName: g.firstName,
    lastName: g.lastName,
    email: g.email,
    phone: g.phone,
    notes: g.notes,
    lifeStageId: g.lifeStageId,
    gender: g.gender as string | null,
    language: g.language,
    birthDate: g.birthDate ? g.birthDate.toISOString().split("T")[0] : null,
    workCity: g.workCity,
    workIndustry: g.workIndustry,
    meetingPreference: g.meetingPreference as string | null,
    memberId: g.memberId,
    claimedSmallGroup: g.claimedSmallGroup,
    eventRegistrations: g.eventRegistrations,
    pendingGroupName: pendingRequest?.smallGroup?.name ?? null,
  }
}

async function getLifeStages() {
  return db.lifeStage.findMany({
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  })
}

async function getGuestEventRegistrations(guestId: string) {
  return db.eventRegistrant.findMany({
    where: { guestId },
    orderBy: { createdAt: "desc" },
    include: {
      event: {
        include: {
          ministries: { include: { ministry: { select: { name: true } } } },
        },
      },
    },
  })
}

export default async function GuestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [guest, lifeStages, registrations] = await Promise.all([
    getGuest(id),
    getLifeStages(),
    getGuestEventRegistrations(id),
  ])

  if (!guest) notFound()

  const pipelineStatus = computeGuestStatus({
    memberId: guest.memberId,
    hasPendingSmallGroupRequest: guest.pendingGroupName !== null,
    eventRegistrations: guest.eventRegistrations,
  })

  return (
    <GuestForm
      lifeStages={lifeStages}
      guest={guest}
      eventHistory={<GuestEventHistory registrations={registrations} />}
      matchSection={
        <GuestMatchSection
          guestId={id}
          pipelineStatus={pipelineStatus}
          claimedGroup={guest.claimedSmallGroup}
          pendingGroupName={guest.pendingGroupName}
        />
      }
    />
  )
}
