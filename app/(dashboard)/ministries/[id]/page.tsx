import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { getMinistryName } from "@/lib/metadata"
import { MinistryForm } from "../ministry-form"
import { type MinistryRow } from "../columns"

async function getData(id: string) {
  const [ministry, lifeStages] = await Promise.all([
    db.ministry.findUnique({
      where: { id },
      include: {
        lifeStage: { select: { id: true, name: true } },
      },
    }),
    db.lifeStage.findMany({
      orderBy: { order: "asc" },
      select: { id: true, name: true },
    }),
  ])
  return { ministry, lifeStages }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const name = await getMinistryName(id)
  return { title: { absolute: name ? `${name} · Ministries` : "Ministries" } }
}

export default async function EditMinistryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { ministry, lifeStages } = await getData(id)

  if (!ministry) notFound()

  const ministryRow: MinistryRow = {
    id: ministry.id,
    name: ministry.name,
    lifeStage: ministry.lifeStage?.name ?? null,
    lifeStageId: ministry.lifeStageId ?? null,
    description: ministry.description ?? null,
    eventCount: 0,
    logoUrl: ministry.logoUrl ?? null,
    themeColorPrimary: ministry.themeColorPrimary ?? null,
    themeColorSecondary: ministry.themeColorSecondary ?? null,
    themeColorAccent: ministry.themeColorAccent ?? null,
  }

  return (
    <MinistryForm
      lifeStages={lifeStages}
      ministry={ministryRow}
    />
  )
}
