import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { MemberForm } from "../member-form"
import { MemberEventHistory } from "./member-event-history"
import { MemberSmallGroups } from "./member-small-groups"
import { MemberMatchSection } from "./member-match-section"
import { type MemberRow } from "../columns"

async function getMember(id: string): Promise<MemberRow | null> {
  const m = await db.member.findUnique({
    where: { id },
    include: {
      lifeStage: { select: { id: true, name: true } },
      smallGroup: { select: { name: true } },
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
    birthDate: m.birthDate ? m.birthDate.toISOString().split("T")[0] : null,
    workCity: m.workCity,
    workIndustry: m.workIndustry,
    meetingPreference: m.meetingPreference,
  }
}

async function getLifeStages() {
  return db.lifeStage.findMany({
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  })
}

async function getMemberSmallGroupInfo(memberId: string) {
  const m = await db.member.findUnique({
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
  })
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

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [member, lifeStages, registrations, smallGroupInfo] = await Promise.all([
    getMember(id),
    getLifeStages(),
    getMemberEventRegistrations(id),
    getMemberSmallGroupInfo(id),
  ])

  if (!member) notFound()

  return (
    <MemberForm
      lifeStages={lifeStages}
      member={member}
      eventHistory={<MemberEventHistory registrations={registrations} />}
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
            />
          </div>
        ) : undefined
      }
    />
  )
}
