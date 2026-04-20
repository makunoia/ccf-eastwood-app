import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { BreakoutGroupsTable } from "./breakout-table"

const breakoutGroupsInclude = {
  orderBy: { createdAt: "asc" } as const,
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
            },
          },
        },
      },
    },
    linkedSmallGroup: {
      select: { id: true, name: true },
    },
    lifeStage: { select: { id: true, name: true } },
    schedules: { select: { dayOfWeek: true, timeStart: true } },
    _count: { select: { members: true } },
  },
}

async function getEventBreakouts(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      _count: { select: { registrants: true } },
      registrants: {
        select: { id: true },
        where: { breakoutGroupMemberships: { none: {} } },
      },
      volunteers: {
        where: { status: "Confirmed" },
        orderBy: { createdAt: "asc" as const },
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
              },
            },
          },
          committee: { select: { id: true, name: true } },
          preferredRole: { select: { id: true, name: true } },
          assignedRole: { select: { id: true, name: true } },
        },
      },
      breakoutGroups: breakoutGroupsInclude,
    },
  })
}

export default async function BreakoutsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [event, lifeStages] = await Promise.all([
    getEventBreakouts(id),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ])
  if (!event) notFound()

  const confirmedVolunteers = [...event.volunteers]

  const breakoutGroupRows = event.breakoutGroups.map((g) => ({
    ...g,
    memberCount: g._count.members,
  }))

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <h2 className="text-lg font-semibold">Breakout Groups</h2>
      <BreakoutGroupsTable
        eventId={event.id}
        breakoutGroups={breakoutGroupRows}
        registrantCount={event._count.registrants}
        unassignedCount={event.registrants.length}
        volunteers={confirmedVolunteers}
        lifeStages={lifeStages}
      />
    </div>
  )
}
