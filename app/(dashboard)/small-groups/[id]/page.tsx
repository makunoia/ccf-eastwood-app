import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { SmallGroupForm } from "../small-group-form"
import { type SmallGroupRow } from "../columns"

type GroupMember = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
}

async function getSmallGroup(id: string): Promise<(SmallGroupRow & { groupMembers: GroupMember[] }) | null> {
  const g = await db.smallGroup.findUnique({
    where: { id },
    include: {
      leader: { select: { id: true, firstName: true, lastName: true } },
      parentGroup: { select: { id: true, name: true } },
      lifeStage: { select: { id: true, name: true } },
      members: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      },
    },
  })
  if (!g) return null
  return {
    id: g.id,
    name: g.name,
    leaderName: `${g.leader.firstName} ${g.leader.lastName}`,
    leaderId: g.leader.id,
    parentGroupId: g.parentGroupId,
    parentGroupName: g.parentGroup?.name ?? null,
    memberCount: g.members.length,
    lifeStage: g.lifeStage?.name ?? null,
    lifeStageId: g.lifeStageId,
    language: g.language,
    genderFocus: g.genderFocus,
    ageRangeMin: g.ageRangeMin,
    ageRangeMax: g.ageRangeMax,
    meetingFormat: g.meetingFormat,
    locationCity: g.locationCity,
    memberLimit: g.memberLimit,
    groupMembers: g.members,
  }
}

async function getData() {
  const [members, smallGroups, lifeStages] = await Promise.all([
    db.member.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    db.smallGroup.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.lifeStage.findMany({
      orderBy: { order: "asc" },
      select: { id: true, name: true },
    }),
  ])
  return { members, smallGroups, lifeStages }
}

export default async function SmallGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [group, { members, smallGroups, lifeStages }] = await Promise.all([
    getSmallGroup(id),
    getData(),
  ])

  if (!group) notFound()

  return (
    <SmallGroupForm
      members={members}
      smallGroups={smallGroups}
      lifeStages={lifeStages}
      group={group!}
      groupMembers={group!.groupMembers}
    />
  )
}
