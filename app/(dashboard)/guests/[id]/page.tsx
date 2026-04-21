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
            breakoutGroupMemberships: {
              select: {
                breakoutGroupId: true,
                breakoutGroup: {
                  select: {
                    name: true,
                    event: { select: { name: true } },
                    facilitator: {
                      select: {
                        member: { select: { firstName: true, lastName: true } },
                      },
                    },
                    linkedSmallGroup: {
                      select: {
                        name: true,
                        leader: { select: { firstName: true, lastName: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    db.smallGroupMemberRequest.findFirst({
      where: { guestId: id, status: "Pending" },
      select: { smallGroup: { select: { id: true, name: true } } },
    }),
  ])
  if (!g) return null

  let matchedBreakout: {
    eventName: string
    breakoutGroupName: string
    facilitatorName: string | null
    linkedSmallGroup: {
      name: string
      leader: { firstName: string; lastName: string } | null
    } | null
  } | null = null
  for (const reg of g.eventRegistrations) {
    const m = reg.breakoutGroupMemberships[0]
    if (m) {
      const faci = m.breakoutGroup.facilitator
      matchedBreakout = {
        eventName: m.breakoutGroup.event.name,
        breakoutGroupName: m.breakoutGroup.name,
        facilitatorName: faci?.member
          ? `${faci.member.firstName} ${faci.member.lastName}`
          : null,
        linkedSmallGroup: m.breakoutGroup.linkedSmallGroup,
      }
      break
    }
  }

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
    birthMonth: g.birthMonth,
    birthYear: g.birthYear,
    workCity: g.workCity,
    workIndustry: g.workIndustry,
    meetingPreference: g.meetingPreference as string | null,
    memberId: g.memberId,
    claimedSmallGroup: g.claimedSmallGroup,
    eventRegistrations: g.eventRegistrations,
    pendingGroupName: pendingRequest?.smallGroup?.name ?? null,
    pendingGroupId: pendingRequest?.smallGroup?.id ?? null,
    matchedBreakout,
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
      guest={guest}
      eventHistory={<GuestEventHistory registrations={registrations} />}
      matchSection={
        <GuestMatchSection
          guestId={id}
          pipelineStatus={pipelineStatus}
          claimedGroup={guest.claimedSmallGroup}
          pendingGroupName={guest.pendingGroupName}
          pendingGroupId={guest.pendingGroupId}
          matchedBreakout={guest.matchedBreakout}
          initialPrefs={{
            lifeStageId: guest.lifeStageId ?? "",
            gender: guest.gender ?? "",
            language: guest.language,
            workCity: guest.workCity ?? "",
            workIndustry: guest.workIndustry ?? "",
            meetingPreference: guest.meetingPreference ?? "",
          }}
          lifeStages={lifeStages}
        />
      }
    />
  )
}
