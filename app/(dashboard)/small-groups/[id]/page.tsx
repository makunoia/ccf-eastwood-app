import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { SmallGroupForm } from "../small-group-form"
import { type SmallGroupRow } from "../columns"

type GroupMember = {
  id: string
  firstName: string
  lastName: string
  groupStatus: "Member" | "Timothy" | "Leader" | null
}

export type PendingRequest = {
  id: string
  type: "guest" | "member"
  name: string
  fromGroupName: string | null
  assignedByName: string | null
  createdAt: Date
}

export type GroupLogEntry = {
  id: string
  action: string
  description: string | null
  performedByName: string | null
  createdAt: Date
}

async function getSmallGroup(id: string): Promise<(SmallGroupRow & {
  groupMembers: GroupMember[]
  leaderConfirmationToken: string | null
  pendingRequests: PendingRequest[]
  logs: GroupLogEntry[]
}) | null> {
  const g = await db.smallGroup.findUnique({
    where: { id },
    include: {
      leader: { select: { id: true, firstName: true, lastName: true } },
      parentGroup: { select: { id: true, name: true } },
      lifeStage: { select: { id: true, name: true } },
      members: {
        select: { id: true, firstName: true, lastName: true, groupStatus: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      },
      memberRequests: {
        where: { status: "Pending" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          guestId: true,
          memberId: true,
          createdAt: true,
          guest: { select: { firstName: true, lastName: true } },
          member: { select: { firstName: true, lastName: true } },
          fromGroup: { select: { name: true } },
          assignedByUser: { select: { name: true } },
        },
      },
      logs: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          action: true,
          description: true,
          createdAt: true,
          performedByUser: { select: { name: true } },
        },
      },
    },
  })
  if (!g) return null

  const pendingRequests: PendingRequest[] = g.memberRequests.map((req) => ({
    id: req.id,
    type: req.guestId ? "guest" : "member",
    name: req.guest
      ? `${req.guest.firstName} ${req.guest.lastName}`
      : req.member
        ? `${req.member.firstName} ${req.member.lastName}`
        : "Unknown",
    fromGroupName: (req as any).fromGroup?.name ?? null,
    assignedByName: req.assignedByUser?.name ?? null,
    createdAt: req.createdAt,
  }))

  const logs: GroupLogEntry[] = g.logs.map((l) => ({
    id: l.id,
    action: l.action,
    description: l.description,
    performedByName: l.performedByUser?.name ?? null,
    createdAt: l.createdAt,
  }))

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
    scheduleDayOfWeek: g.scheduleDayOfWeek,
    scheduleTimeStart: g.scheduleTimeStart,
    scheduleTimeEnd: g.scheduleTimeEnd,
    leaderConfirmationToken: g.leaderConfirmationToken,
    groupMembers: g.members,
    pendingRequests,
    logs,
  }
}

async function getData() {
  const [members, smallGroups, lifeStages] = await Promise.all([
    db.member.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, smallGroupId: true },
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
      pendingRequests={group!.pendingRequests}
      logs={group!.logs}
      leaderConfirmationToken={group!.leaderConfirmationToken}
    />
  )
}
