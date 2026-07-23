import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { mapCouplesInRoster } from "@/lib/family-links"
import { logActorName } from "@/lib/small-group-log"
import { SmallGroupForm } from "../small-group-form"
import { type SmallGroupRow } from "../columns"

type GroupMember = {
  id: string
  firstName: string
  lastName: string
  groupStatus: "Member" | "Timothy" | "Leader" | null
  /** For Couples groups: the roster memberId of this member's spouse, if also in the group. */
  spouseId: string | null
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
  pendingRequests: PendingRequest[]
  logs: GroupLogEntry[]
}) | null> {
  const g = await db.smallGroup.findUnique({
    where: { id },
    include: {
      leader: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      parentGroup: { select: { id: true, name: true } },
      lifeStages: { select: { id: true, name: true }, orderBy: { order: "asc" } },
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
          performedByMember: { select: { firstName: true, lastName: true } },
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
    fromGroupName: (req as { fromGroup?: { name: string } | null }).fromGroup?.name ?? null,
    assignedByName: req.assignedByUser?.name ?? null,
    createdAt: req.createdAt,
  }))

  // Leader confirmation submissions are event-less, so they have no place on the
  // event workspace's submissions page — this timeline is where they surface. They
  // matter most when they changed nothing (everything deferred), which leaves no
  // SmallGroupLog row at all.
  const submissions = await db.confirmationSubmission.findMany({
    where: { smallGroupId: id, source: "SmallGroupLeader" },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      submittedByName: true,
      confirmedCount: true,
      declinedCount: true,
      deferredCount: true,
      createdAt: true,
    },
  })

  const logs: GroupLogEntry[] = [
    ...g.logs.map((l) => ({
      id: l.id,
      action: l.action as string,
      description: l.description,
      performedByName: logActorName(l),
      createdAt: l.createdAt,
    })),
    ...submissions.map((s) => ({
      id: `submission-${s.id}`,
      action: "ConfirmationSubmitted",
      description: `${s.submittedByName} submitted the confirmation form — ${s.confirmedCount} confirmed, ${s.declinedCount} declined, ${s.deferredCount} deferred`,
      performedByName: null,
      createdAt: s.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  // Couples groups: pair roster members via shared Father/Mother family links
  const couples =
    g.groupType === "Couples"
      ? await mapCouplesInRoster(g.members.map((m) => m.id))
      : new Map<string, string>()

  return {
    id: g.id,
    name: g.name,
    status: g.status as "Active" | "Pending" | "Inactive",
    groupType: g.groupType as "Regular" | "Couples",
    leaderName: g.leader ? `${g.leader.firstName} ${g.leader.lastName}` : null,
    leaderId: g.leader?.id ?? null,
    leaderFirstName: g.leader?.firstName ?? "",
    leaderLastName: g.leader?.lastName ?? "",
    leaderEmail: g.leader?.email ?? null,
    leaderPhone: g.leader?.phone ?? null,
    parentGroupId: g.parentGroupId,
    parentGroupName: g.parentGroup?.name ?? null,
    memberCount: g.members.length,
    tempMemberCount: pendingRequests.length,
    lifeStages: g.lifeStages,
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
    groupMembers: g.members.map((m) => ({
      ...m,
      spouseId: couples.get(m.id) ?? null,
    })),
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const group = await db.smallGroup.findUnique({ where: { id }, select: { name: true } })
  return { title: { absolute: group ? `${group.name} · DGroups` : "DGroups" } }
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
    />
  )
}
