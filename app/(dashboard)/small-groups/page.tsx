import { db } from "@/lib/db"
import { type SmallGroupRow } from "./columns"
import { SmallGroupsTable } from "./small-groups-table"
import { SmallGroupsToolbar } from "./toolbar"

async function getSmallGroups(): Promise<SmallGroupRow[]> {
  const groups = await db.smallGroup.findMany({
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
    meetingSchedules: [],
  }))
}

export default async function SmallGroupsPage() {
  const groups = await getSmallGroups()

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

      <SmallGroupsTable groups={groups} />
    </div>
  )
}
