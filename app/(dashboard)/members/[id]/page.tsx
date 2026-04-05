import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { MemberForm } from "../member-form"
import { MemberEventHistory } from "./member-event-history"
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

async function getMemberEventRegistrations(memberId: string) {
  return db.eventRegistrant.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          startDate: true,
          price: true,
          ministry: { select: { name: true } },
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
  const [member, lifeStages, registrations] = await Promise.all([
    getMember(id),
    getLifeStages(),
    getMemberEventRegistrations(id),
  ])

  if (!member) notFound()

  return (
    <MemberForm
      lifeStages={lifeStages}
      member={member}
      eventHistory={<MemberEventHistory registrations={registrations} />}
    />
  )
}
