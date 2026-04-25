import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { GuestEventHistory } from "./guest-event-history"
import { GuestActivityLog, type ActivityEntry } from "./guest-activity-log"
import { GuestDetailContent } from "./guest-detail-content"
import { computeGuestStatus } from "@/lib/guest-utils"

async function getGuest(id: string) {
  const [g, pendingRequest, rejectedRequest] = await Promise.all([
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
        member: { select: { createdAt: true } },
      },
    }),
    db.smallGroupMemberRequest.findFirst({
      where: { guestId: id, status: "Pending" },
      select: { smallGroup: { select: { id: true, name: true } } },
    }),
    db.smallGroupMemberRequest.findFirst({
      where: { guestId: id, status: "Rejected" },
      select: { id: true },
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
    scheduleDayOfWeek: g.scheduleDayOfWeek,
    scheduleTimeStart: g.scheduleTimeStart,
    memberId: g.memberId,
    memberCreatedAt: g.member?.createdAt ?? null,
    claimedSmallGroup: g.claimedSmallGroup,
    eventRegistrations: g.eventRegistrations,
    pendingGroupName: pendingRequest?.smallGroup?.name ?? null,
    pendingGroupId: pendingRequest?.smallGroup?.id ?? null,
    hasRejectedSmallGroupRequest: !!rejectedRequest,
    matchedBreakout,
  }
}

async function getGuestActivityLogs(guestId: string) {
  return db.smallGroupLog.findMany({
    where: { guestId },
    orderBy: { createdAt: "desc" },
    include: {
      smallGroup: { select: { id: true, name: true } },
      performedByUser: { select: { name: true } },
    },
  })
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
  const [guest, lifeStages, registrations, activityLogs] = await Promise.all([
    getGuest(id),
    getLifeStages(),
    getGuestEventRegistrations(id),
    getGuestActivityLogs(id),
  ])

  if (!guest) notFound()

  const pipelineStatus = computeGuestStatus({
    memberId: guest.memberId,
    hasPendingSmallGroupRequest: guest.pendingGroupName !== null,
    hasRejectedSmallGroupRequest: guest.hasRejectedSmallGroupRequest,
    eventRegistrations: guest.eventRegistrations,
  })

  // Source event: the first event the guest registered for (oldest by date)
  const sourceEvent = registrations.length > 0
    ? {
        id: registrations[registrations.length - 1].event.id,
        name: registrations[registrations.length - 1].event.name,
        date: registrations[registrations.length - 1].event.startDate,
      }
    : null

  // Build unified activity entries: small group logs + event registrations + optional promotion
  const unifiedEntries: ActivityEntry[] = [
    // SmallGroup log entries
    ...activityLogs.map((log) => ({
      kind: "smallGroupLog" as const,
      id: log.id,
      action: log.action,
      description: log.description,
      smallGroup: log.smallGroup,
      performedByUser: log.performedByUser,
      createdAt: log.createdAt,
    })),
    // Event registration entries
    ...registrations.map((r) => ({
      kind: "eventRegistration" as const,
      id: r.id,
      event: { id: r.event.id, name: r.event.name },
      createdAt: r.createdAt,
    })),
    // Promotion entry (if guest has been promoted to a member)
    ...(guest.memberId && guest.memberCreatedAt
      ? [
          {
            kind: "promotion" as const,
            memberId: guest.memberId,
            createdAt: guest.memberCreatedAt,
          },
        ]
      : []),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return (
    <GuestDetailContent
      guest={guest}
      lifeStages={lifeStages}
      pipelineStatus={pipelineStatus}
      sourceEvent={sourceEvent}
      eventHistory={<GuestEventHistory registrations={registrations} />}
      activityHistory={<GuestActivityLog entries={unifiedEntries} />}
    />
  )
}

