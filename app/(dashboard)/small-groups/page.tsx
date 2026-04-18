import { GenderFocus, MeetingFormat, Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { type SmallGroupRow } from "./columns"
import { SmallGroupsTable } from "./small-groups-table"
import { SmallGroupsToolbar } from "./toolbar"
import { SmallGroupsFilters } from "./small-groups-filters"

async function getSmallGroups(where: Prisma.SmallGroupWhereInput): Promise<SmallGroupRow[]> {
  const groups = await db.smallGroup.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      leader: { select: { id: true, firstName: true, lastName: true } },
      parentGroup: { select: { id: true, name: true } },
      lifeStage: { select: { id: true, name: true } },
      _count: { select: { members: true } },
    },
  })

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    leaderName: `${g.leader.firstName} ${g.leader.lastName}`,
    leaderId: g.leader.id,
    parentGroupId: g.parentGroupId,
    parentGroupName: g.parentGroup?.name ?? null,
    memberCount: g._count.members,
    lifeStage: g.lifeStage?.name ?? null,
    lifeStageId: g.lifeStageId,
    language: g.language,
    genderFocus: g.genderFocus,
    ageRangeMin: g.ageRangeMin,
    ageRangeMax: g.ageRangeMax,
    meetingFormat: g.meetingFormat,
    locationCity: g.locationCity,
    memberLimit: g.memberLimit,
    scheduleDayOfWeek: g.scheduleDayOfWeek,
    scheduleTimeStart: g.scheduleTimeStart,
  }))
}

export default async function SmallGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const search = (params.search as string) || ""
  const lifeStageId = (params.lifeStageId as string) || ""
  const genderFocus = (params.genderFocus as string) || ""
  const meetingFormat = (params.meetingFormat as string) || ""

  const where: Prisma.SmallGroupWhereInput = {
    AND: [
      search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { leader: { firstName: { contains: search, mode: "insensitive" } } },
              { leader: { lastName: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {},
      lifeStageId ? { lifeStageId } : {},
      genderFocus ? { genderFocus: genderFocus as GenderFocus } : {},
      meetingFormat ? { meetingFormat: meetingFormat as MeetingFormat } : {},
    ],
  }

  const [groups, lifeStages] = await Promise.all([
    getSmallGroups(where),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Small Groups</h2>
          <p className="text-sm text-muted-foreground">
            Manage fellowship groups and their hierarchy
          </p>
        </div>
        <SmallGroupsToolbar />
      </div>

      <SmallGroupsFilters
        key={`${search}-${lifeStageId}-${genderFocus}-${meetingFormat}`}
        lifeStages={lifeStages}
        search={search}
        lifeStageId={lifeStageId}
        genderFocus={genderFocus}
        meetingFormat={meetingFormat}
      />

      <SmallGroupsTable groups={groups} />
    </div>
  )
}
