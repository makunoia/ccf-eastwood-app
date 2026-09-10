import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { requireEventModule } from "@/lib/events/require-module"
import { unassignedCandidateWhere } from "@/lib/breakouts/candidate-pool"
import { eventSurface } from "@/lib/breakouts/owner"
import { breakoutGroupsInclude } from "@/lib/breakouts/queries"
import { resolveSeatedScope } from "@/lib/events/pool-scope"
import type { Prisma } from "@/app/generated/prisma/client"
import { auth } from "@/lib/auth"
import { canImport } from "@/lib/permissions"
import { BreakoutGroupsTable } from "./breakout-group"

export const metadata: Metadata = {
  title: "Breakout Groups",
}

async function getEventBreakouts(id: string, seatedScope: Prisma.BreakoutGroupWhereInput) {
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
        // `seatedScope`, not a bare `{ eventId }`. On a collab day someone the
        // day has already seated is placed, and counting them here would both
        // overstate "N unassigned" and disagree with `autoAssignBreakouts`,
        // which reads the same scope to decide who it would actually place.
        // See `resolveSeatedScope`.
        where: unassignedCandidateWhere(seatedScope),
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
  await requireEventModule(id, "Breakout")
  const seatedScope = await resolveSeatedScope(eventSurface(id).owner)
  const [session, event, lifeStages] = await Promise.all([
    auth(),
    getEventBreakouts(id, seatedScope),
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
        surface={eventSurface(event.id)}
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
