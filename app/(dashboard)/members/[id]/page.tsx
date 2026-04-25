import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { MemberForm } from "../member-form"
import { MemberEventHistory } from "./member-event-history"
import { MemberSmallGroups } from "./member-small-groups"
import { MemberMatchSection } from "./member-match-section"
import { MemberActivityLog, type MemberActivityEntry } from "./member-activity-log"
import { type MemberRow } from "../columns"

function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number)
  return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

async function getMember(id: string): Promise<MemberRow | null> {
  const m = await db.member.findUnique({
    where: { id },
    include: {
      lifeStage: { select: { id: true, name: true } },
      smallGroup: { select: { name: true } },
      schedulePreferences: {
        select: { dayOfWeek: true, timeStart: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  })
  if (!m) return null
  return {
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    email: m.email,
    phone: m.phone,
    smallGroupName: m.smallGroup?.name ?? null,
    lifeStage: m.lifeStage?.name ?? null,
    dateJoined: m.dateJoined.toISOString().split("T")[0],
    address: m.address,
    notes: m.notes,
    lifeStageId: m.lifeStageId,
    gender: m.gender,
    language: m.language,
    birthMonth: m.birthMonth,
    birthYear: m.birthYear,
    workCity: m.workCity,
    workIndustry: m.workIndustry,
    meetingPreference: m.meetingPreference,
    scheduleDayOfWeek: m.schedulePreferences[0]?.dayOfWeek ?? null,
    scheduleTimeStart: m.schedulePreferences[0]?.timeStart ?? null,
  }
}

async function getLifeStages() {
  return db.lifeStage.findMany({
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  })
}

async function getMemberSmallGroupInfo(memberId: string) {
  const [m, pendingTransferReq] = await Promise.all([
    db.member.findUnique({
      where: { id: memberId },
      select: {
        smallGroup: { select: { id: true, name: true } },
        groupStatus: true,
        ledGroups: {
          select: {
            id: true,
            name: true,
            _count: { select: { members: true } },
          },
          orderBy: { name: "asc" },
        },
      },
    }),
    db.smallGroupMemberRequest.findFirst({
      where: { memberId, status: "Pending" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        smallGroup: { select: { name: true } },
        createdAt: true,
      },
    }),
  ])
  if (!m) return null
  return {
    memberOf: m.smallGroup
      ? {
          id: m.smallGroup.id,
          name: m.smallGroup.name,
          groupStatus: m.groupStatus ?? null,
        }
      : null,
    ledGroups: m.ledGroups.map((g: { id: string; name: string; _count: { members: number } }) => ({
      id: g.id,
      name: g.name,
      memberCount: g._count.members,
    })),
    pendingTransfer: pendingTransferReq
      ? {
          id: pendingTransferReq.id,
          toGroupName: pendingTransferReq.smallGroup.name,
          createdAt: pendingTransferReq.createdAt,
        }
      : null,
  }
}

async function getMemberEventRegistrations(memberId: string) {
  return db.eventRegistrant.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    include: {
      event: {
        include: {
          ministries: { include: { ministry: { select: { name: true } } } },
        },
      },
    },
  })
}

async function getMemberActivityData(memberId: string) {
  // Find the guest linked to this member (if promoted from guest)
  const guest = await db.guest.findUnique({
    where: { memberId },
    select: { id: true, createdAt: true },
  })

  const [memberLogs, guestLogs, memberRegistrations, guestRegistrations] =
    await Promise.all([
      db.smallGroupLog.findMany({
        where: { memberId },
        orderBy: { createdAt: "desc" },
        include: {
          smallGroup: { select: { id: true, name: true } },
          performedByUser: { select: { name: true } },
        },
      }),
      guest
        ? db.smallGroupLog.findMany({
            where: { guestId: guest.id },
            orderBy: { createdAt: "desc" },
            include: {
              smallGroup: { select: { id: true, name: true } },
              performedByUser: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      db.eventRegistrant.findMany({
        where: { memberId },
        orderBy: { createdAt: "desc" },
        select: { id: true, event: { select: { id: true, name: true } }, createdAt: true },
      }),
      guest
        ? db.eventRegistrant.findMany({
            where: { guestId: guest.id },
            orderBy: { createdAt: "desc" },
            select: { id: true, event: { select: { id: true, name: true } }, createdAt: true },
          })
        : Promise.resolve([]),
    ])

  const entries: MemberActivityEntry[] = [
    ...memberLogs.map((log) => ({
      kind: "smallGroupLog" as const,
      id: log.id,
      action: log.action,
      description: log.description,
      smallGroup: log.smallGroup,
      performedByUser: log.performedByUser,
      createdAt: log.createdAt,
    })),
    ...guestLogs.map((log) => ({
      kind: "smallGroupLog" as const,
      id: `guest-${log.id}`,
      action: log.action,
      description: log.description,
      smallGroup: log.smallGroup,
      performedByUser: log.performedByUser,
      createdAt: log.createdAt,
    })),
    ...memberRegistrations.map((r) => ({
      kind: "eventRegistration" as const,
      id: r.id,
      event: r.event,
      createdAt: r.createdAt,
    })),
    ...guestRegistrations.map((r) => ({
      kind: "eventRegistration" as const,
      id: `guest-reg-${r.id}`,
      event: r.event,
      createdAt: r.createdAt,
    })),
    ...(guest
      ? [
          {
            kind: "guestOrigin" as const,
            guestId: guest.id,
            createdAt: guest.createdAt,
          },
        ]
      : []),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return entries
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [member, lifeStages, registrations, smallGroupInfo, activityEntries] = await Promise.all([
    getMember(id),
    getLifeStages(),
    getMemberEventRegistrations(id),
    getMemberSmallGroupInfo(id),
    getMemberActivityData(id),
  ])

  if (!member) notFound()

  return (
    <MemberForm
      member={member}
      eventHistory={<MemberEventHistory registrations={registrations} />}
      activityHistory={<MemberActivityLog entries={activityEntries} />}
      smallGroups={
        smallGroupInfo ? (
          <div className="space-y-6">
            <MemberSmallGroups
              memberOf={smallGroupInfo.memberOf}
              ledGroups={smallGroupInfo.ledGroups}
            />
            <div className="border-t" />
            <MemberMatchSection
              memberId={id}
              hasGroup={!!smallGroupInfo.memberOf}
              pendingTransfer={smallGroupInfo.pendingTransfer}
              initialPrefs={{
                lifeStageId: member.lifeStageId ?? "",
                gender: member.gender ?? "",
                language: member.language,
                workCity: member.workCity ?? "",
                workIndustry: member.workIndustry ?? "",
                meetingPreference: member.meetingPreference ?? "",
                scheduleDayOfWeek:
                  member.scheduleDayOfWeek != null ? String(member.scheduleDayOfWeek) : "",
                scheduleTimeStart: member.scheduleTimeStart ?? "",
                scheduleTimeEnd: member.scheduleTimeStart ? addOneHour(member.scheduleTimeStart) : "",
              }}
              lifeStages={lifeStages}
            />
          </div>
        ) : undefined
      }
    />
  )
}
