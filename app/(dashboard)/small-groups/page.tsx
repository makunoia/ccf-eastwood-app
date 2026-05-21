import { GenderFocus, MeetingFormat, MemberRequestStatus, Prisma, SmallGroupStatus } from "@/app/generated/prisma/client"
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
      _count: {
        select: {
          members: true,
          memberRequests: { where: { status: MemberRequestStatus.Pending } },
        },
      },
    },
  })

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    status: g.status as "Active" | "Pending" | "Inactive",
    leaderName: `${g.leader.firstName} ${g.leader.lastName}`,
    leaderId: g.leader.id,
    parentGroupId: g.parentGroupId,
    parentGroupName: g.parentGroup?.name ?? null,
    memberCount: g._count.members,
    tempMemberCount: g._count.memberRequests,
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
    scheduleTimeEnd: g.scheduleTimeEnd,
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
  const status = (params.status as string) || ""

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
      status ? { status: status as SmallGroupStatus } : {},
    ],
  }

  const [groups, lifeStages, pendingCount] = await Promise.all([
    getSmallGroups(where),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
    db.smallGroup.count({ where: { status: "Pending" } }),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="type-headline">Small Groups</h2>
            {pendingCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                {pendingCount} pending
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Manage fellowship groups and their hierarchy
          </p>
        </div>
        <SmallGroupsToolbar />
      </div>

      <SmallGroupsFilters
        key={`${search}-${lifeStageId}-${genderFocus}-${meetingFormat}-${status}`}
        lifeStages={lifeStages}
        search={search}
        lifeStageId={lifeStageId}
        genderFocus={genderFocus}
        meetingFormat={meetingFormat}
        status={status}
      />

      <SmallGroupsTable groups={groups} />
    </div>
  )
}
