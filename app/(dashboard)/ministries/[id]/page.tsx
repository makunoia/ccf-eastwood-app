import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { MinistryForm } from "../ministry-form"
import { type MinistryRow } from "../columns"

async function getData(id: string) {
  const [ministry, lifeStages, committees] = await Promise.all([
    db.ministry.findUnique({
      where: { id },
      include: {
        lifeStage: { select: { id: true, name: true } },
        _count: { select: { volunteers: true, events: true } },
      },
    }),
    db.lifeStage.findMany({
      orderBy: { order: "asc" },
      select: { id: true, name: true },
    }),
    db.volunteerCommittee.findMany({
      where: { ministryId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        roles: {
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true },
        },
      },
    }),
  ])
  return { ministry, lifeStages, committees }
}

export default async function EditMinistryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { ministry, lifeStages, committees } = await getData(id)

  if (!ministry) notFound()

  const ministryRow: MinistryRow = {
    id: ministry.id,
    name: ministry.name,
    lifeStage: ministry.lifeStage?.name ?? null,
    lifeStageId: ministry.lifeStageId ?? null,
    description: ministry.description ?? null,
    volunteerCount: ministry._count.volunteers,
    eventCount: ministry._count.events,
  }

  return (
    <MinistryForm
      lifeStages={lifeStages}
      ministry={ministryRow}
      committees={committees}
    />
  )
}
