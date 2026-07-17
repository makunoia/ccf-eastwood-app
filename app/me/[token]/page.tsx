import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { MePortalClient } from "./me-portal-client"

export const metadata: Metadata = {
  title: { absolute: "Member Portal" },
}

export const dynamic = "force-dynamic"

export default async function MemberPortalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const member = await db.member.findUnique({
    where: { selfServiceToken: token },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      nickname: true,
      groupStatus: true,
      smallGroup: {
        select: {
          id: true,
          name: true,
          scheduleDayOfWeek: true,
          scheduleTimeStart: true,
          scheduleTimeEnd: true,
          leader: { select: { firstName: true, lastName: true } },
        },
      },
      ledGroups: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          memberLimit: true,
          scheduleDayOfWeek: true,
          scheduleTimeStart: true,
          scheduleTimeEnd: true,
          members: {
            orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
            select: {
              id: true,
              firstName: true,
              lastName: true,
              groupStatus: true,
            },
          },
        },
      },
    },
  })
  if (!member) notFound()

  const [pendingRequest, groupOptions] = await Promise.all([
    db.smallGroupMemberRequest.findFirst({
      where: { memberId: member.id, status: "Pending" },
      select: {
        id: true,
        smallGroup: { select: { id: true, name: true } },
      },
    }),
    db.smallGroup.findMany({
      where: {
        status: "Active",
        ...(member.smallGroup ? { id: { not: member.smallGroup.id } } : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        leader: { select: { firstName: true, lastName: true } },
      },
    }),
  ])

  return (
    <MePortalClient
      token={token}
      member={{
        firstName: member.firstName,
        nickname: member.nickname,
        groupStatus: member.groupStatus,
      }}
      myGroup={member.smallGroup}
      pendingRequest={
        pendingRequest?.smallGroup
          ? {
              id: pendingRequest.id,
              groupId: pendingRequest.smallGroup.id,
              groupName: pendingRequest.smallGroup.name,
            }
          : null
      }
      ledGroups={member.ledGroups}
      groupOptions={groupOptions.map((g) => ({
        id: g.id,
        name: g.name,
        leaderName: g.leader ? `${g.leader.firstName} ${g.leader.lastName}` : null,
      }))}
    />
  )
}
