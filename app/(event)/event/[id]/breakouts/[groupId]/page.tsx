import { notFound } from "next/navigation"

import { db } from "@/lib/db"
import { BreakoutDetail } from "./breakout-detail"
import { GroupActions } from "./group-actions"
import { BreakoutNavHeader } from "./breakout-nav-header"
import { BreadcrumbOverride } from "@/components/breadcrumb-context"

const ledGroupsSelect = {
  select: {
    id: true,
    name: true,
    lifeStageId: true,
    genderFocus: true,
    language: true,
    ageRangeMin: true,
    ageRangeMax: true,
    meetingFormat: true,
    locationCity: true,
    scheduleDayOfWeek: true,
    scheduleTimeStart: true,
  },
} as const

async function getBreakoutGroup(groupId: string, eventId: string) {
  return db.breakoutGroup.findFirst({
    where: { id: groupId, eventId },
    include: {
      facilitator: {
        include: {
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              ledGroups: {
                select: {
                  id: true,
                  name: true,
                  lifeStage: { select: { id: true, name: true } },
                  genderFocus: true,
                  language: true,
                  ageRangeMin: true,
                  ageRangeMax: true,
                  meetingFormat: true,
                  locationCity: true,
                  scheduleDayOfWeek: true,
                  scheduleTimeStart: true,
                },
              },
            },
          },
        },
      },
      coFacilitator: {
        include: {
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              ledGroups: {
                select: {
                  id: true,
                  name: true,
                  lifeStage: { select: { id: true, name: true } },
                  genderFocus: true,
                  language: true,
                  ageRangeMin: true,
                  ageRangeMax: true,
                  meetingFormat: true,
                  locationCity: true,
                  scheduleDayOfWeek: true,
                  scheduleTimeStart: true,
                },
              },
            },
          },
        },
      },
      linkedSmallGroup: { select: { id: true, name: true } },
      schedules: { select: { dayOfWeek: true, timeStart: true } },
      lifeStage: { select: { id: true, name: true } },
      members: {
        orderBy: { assignedAt: "asc" },
        include: {
          registrant: {
            select: {
              id: true,
              memberId: true,
              guestId: true,
              firstName: true,
              lastName: true,
              nickname: true,
              mobileNumber: true,
              attendedAt: true,
              occurrenceAttendances: {
                select: { occurrence: { select: { date: true } } },
                orderBy: { occurrence: { date: "asc" } },
              },
              member: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  smallGroup: { select: { id: true, name: true } },
                  groupStatus: true,
                },
              },
              guest: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  })
}

async function getEventContext(eventId: string) {
  return db.event.findUnique({
    where: { id: eventId },
    select: {
      type: true,
      volunteers: {
        where: { status: "Confirmed" },
        include: {
          member: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              ledGroups: ledGroupsSelect,
            },
          },
        },
      },
      registrants: {
        orderBy: { createdAt: "asc" },
        where: {
          breakoutGroupMemberships: { none: {} },
          NOT: {
            member: {
              volunteers: {
                some: {
                  OR: [
                    { facilitatedGroups: { some: { eventId } } },
                    { coFacilitatedGroups: { some: { eventId } } },
                  ],
                },
              },
            },
          },
        },
        select: {
          id: true,
          memberId: true,
          guestId: true,
          firstName: true,
          lastName: true,
          nickname: true,
          mobileNumber: true,
          member: { select: { id: true, firstName: true, lastName: true } },
          guest: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  })
}

export default async function BreakoutGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string; groupId: string }>
}) {
  const { id: eventId, groupId } = await params
  const [group, eventData, lifeStages, totalOccurrences] = await Promise.all([
    getBreakoutGroup(groupId, eventId),
    getEventContext(eventId),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
    db.eventOccurrence.count({ where: { eventId } }),
  ])

  if (!group || !eventData) notFound()

  const confirmedVolunteers = [...eventData.volunteers]

  return (
    <>
      <BreadcrumbOverride
        href={`/event/${eventId}/breakouts/${groupId}`}
        label={group.name}
      />
      <BreakoutNavHeader
        groupId={groupId}
        eventId={eventId}
        title={group.name}
        subtitle={
          <p className="text-sm text-muted-foreground">
            {group.memberLimit != null
              ? `${group.members.length} / ${group.memberLimit} members`
              : "No member cap"}
          </p>
        }
        action={
          <GroupActions
            group={{
              id: group.id,
              name: group.name,
              facilitatorId: group.facilitatorId,
              memberLimit: group.memberLimit,
              linkedSmallGroupId: group.linkedSmallGroupId,
              lifeStageId: group.lifeStageId,
              genderFocus: group.genderFocus,
              language: group.language,
              ageRangeMin: group.ageRangeMin,
              ageRangeMax: group.ageRangeMax,
              meetingFormat: group.meetingFormat,
              locationCity: group.locationCity,
              schedule: group.schedules[0] ?? null,
            }}
            eventId={eventId}
            lifeStages={lifeStages}
            volunteers={confirmedVolunteers}
          />
        }
      />

      <div className="flex flex-1 flex-col gap-6 p-6">
      <BreakoutDetail
        group={{
          id: group.id,
          eventId,
          name: group.name,
          facilitatorId: group.facilitatorId,
          facilitator: group.facilitator,
          coFacilitatorId: group.coFacilitatorId,
          coFacilitator: group.coFacilitator,
          linkedSmallGroupId: group.linkedSmallGroupId,
          linkedSmallGroup: group.linkedSmallGroup,
          lifeStage: group.lifeStage,
          genderFocus: group.genderFocus,
          language: group.language,
          ageRangeMin: group.ageRangeMin,
          ageRangeMax: group.ageRangeMax,
          meetingFormat: group.meetingFormat,
          locationCity: group.locationCity,
          memberLimit: group.memberLimit,
          members: group.members,
          schedules: group.schedules,
          eventType: eventData.type,
          totalOccurrences,
        }}
        unassignedRegistrants={eventData.registrants}
        availableVolunteers={confirmedVolunteers}
      />
      </div>
    </>
  )
}
