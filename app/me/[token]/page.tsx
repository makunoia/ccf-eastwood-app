import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { mapCouplesInRoster } from "@/lib/family-links"
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
          groupType: true,
          memberLimit: true,
          meetingFormat: true,
          locationCity: true,
          language: true,
          ageRangeMin: true,
          ageRangeMax: true,
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
        leaderId: true,
        groupType: true,
        meetingFormat: true,
        scheduleDayOfWeek: true,
        scheduleTimeStart: true,
        scheduleTimeEnd: true,
        leader: { select: { firstName: true, lastName: true } },
      },
    }),
  ])

  // Group the target groups by their leader so the change-group flow can ask
  // "which leader?" before "which of their groups?".
  type GroupOption = {
    id: string
    name: string
    groupType: string
    meetingFormat: string | null
    scheduleDayOfWeek: number | null
    scheduleTimeStart: string | null
    scheduleTimeEnd: string | null
  }
  const leaderMap = new Map<
    string,
    { id: string; name: string; groups: GroupOption[] }
  >()
  for (const g of groupOptions) {
    // A group can only be requested through its leader — skip leaderless ones.
    if (!g.leaderId || !g.leader) continue
    let entry = leaderMap.get(g.leaderId)
    if (!entry) {
      entry = {
        id: g.leaderId,
        name: `${g.leader.firstName} ${g.leader.lastName}`,
        groups: [],
      }
      leaderMap.set(g.leaderId, entry)
    }
    entry.groups.push({
      id: g.id,
      name: g.name,
      groupType: g.groupType,
      meetingFormat: g.meetingFormat,
      scheduleDayOfWeek: g.scheduleDayOfWeek,
      scheduleTimeStart: g.scheduleTimeStart,
      scheduleTimeEnd: g.scheduleTimeEnd,
    })
  }
  const leaderOptions = Array.from(leaderMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  )

  // For Couples groups, derive each member's in-group spouse from Family data so
  // the roster can pair them. Non-couples groups skip the lookup entirely.
  const ledGroups = await Promise.all(
    member.ledGroups.map(async (g) => {
      if (g.groupType !== "Couples") {
        return { ...g, members: g.members.map((m) => ({ ...m, spouseId: null })) }
      }
      const pairs = await mapCouplesInRoster(g.members.map((m) => m.id))
      return {
        ...g,
        members: g.members.map((m) => ({ ...m, spouseId: pairs.get(m.id) ?? null })),
      }
    })
  )

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
      ledGroups={ledGroups}
      leaderOptions={leaderOptions}
    />
  )
}
