import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canImport } from "@/lib/permissions"
import { BreakoutGroupsTable } from "./breakout-group"

export const metadata: Metadata = {
  title: "Breakout Groups",
}

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
                lifeStages: { select: { id: true } },
                genderFocus: true,
                language: true,
                ageRangeMin: true,
                ageRangeMax: true,
                meetingFormat: true,
                locationCity: true,
                scheduleDayOfWeek: true,
                scheduleTimeStart: true,
                scheduleTimeEnd: true,
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
                lifeStages: { select: { id: true } },
                genderFocus: true,
                language: true,
                ageRangeMin: true,
                ageRangeMax: true,
                meetingFormat: true,
                locationCity: true,
                scheduleDayOfWeek: true,
                scheduleTimeStart: true,
                scheduleTimeEnd: true,
              },
            },
          },
        },
      },
    },
    linkedSmallGroup: {
      select: { id: true, name: true },
    },
    lifeStages: { select: { id: true, name: true }, orderBy: { order: "asc" as const } },
    schedules: { select: { dayOfWeek: true, timeStart: true, timeEnd: true } },
    _count: { select: { members: true } },
  },
}

async function getEventBreakouts(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      ministries: {
        select: {
          ministry: {
            select: { lifeStageId: true },
          },
        },
      },
      _count: { select: { registrants: true } },
      registrants: {
        select: { id: true },
        where: {
          breakoutGroupMemberships: { none: {} },
          NOT: {
            member: {
              volunteers: {
                some: { eventId: id, status: "Confirmed" },
              },
            },
          },
        },
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
                  lifeStages: { select: { id: true } },
                  genderFocus: true,
                  language: true,
                  ageRangeMin: true,
                  ageRangeMax: true,
                  meetingFormat: true,
                  locationCity: true,
                  scheduleDayOfWeek: true,
                  scheduleTimeStart: true,
                  scheduleTimeEnd: true,
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
  const [session, event, lifeStages] = await Promise.all([
    auth(),
    getEventBreakouts(id),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ])
  if (!event) notFound()

  const defaultLifeStageIds =
    event.ministries.length === 1 && event.ministries[0].ministry.lifeStageId
      ? [event.ministries[0].ministry.lifeStageId]
      : []

  const confirmedVolunteers = [...event.volunteers]

  const breakoutGroupRows = event.breakoutGroups.map((g) => ({
    ...g,
    memberCount: g._count.members,
  }))

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <BreakoutGroupsTable
        eventId={event.id}
        breakoutGroups={breakoutGroupRows}
        registrantCount={event._count.registrants}
        unassignedCount={event.registrants.length}
        volunteers={confirmedVolunteers}
        lifeStages={lifeStages}
        defaultLifeStageIds={defaultLifeStageIds}
        canImport={canImport(session, "Events")}
      />
    </div>
  )
}
