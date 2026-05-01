import Link from "next/link"
import { IconPlus } from "@tabler/icons-react"
import { Prisma } from "@/app/generated/prisma/client"

import { Button } from "@/components/ui/button"
import { db } from "@/lib/db"
import { type MinistryRow } from "./columns"
import { MinistriesTable } from "./ministries-table"
import { MinistriesFilters } from "./ministries-filters"

async function getMinistries(where: Prisma.MinistryWhereInput): Promise<MinistryRow[]> {
  const ministries = await db.ministry.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      lifeStage: { select: { id: true, name: true } },
      _count: {
        select: {
          events: true,
        },
      },
    },
  })

  return ministries.map((m) => ({
    id: m.id,
    name: m.name,
    lifeStage: m.lifeStage?.name ?? null,
    lifeStageId: m.lifeStageId ?? null,
    description: m.description ?? null,
    eventCount: m._count.events,
  }))
}

export default async function MinistriesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const search = (params.search as string) || ""
  const lifeStageId = (params.lifeStageId as string) || ""

  const where: Prisma.MinistryWhereInput = {
    AND: [
      search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : {},
      lifeStageId ? { lifeStageId } : {},
    ],
  }

  const [ministries, lifeStages] = await Promise.all([
    getMinistries(where),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="type-headline">Ministries</h2>
          <p className="text-sm text-muted-foreground">
            Manage church ministry departments
          </p>
        </div>
        <Button asChild>
          <Link href="/ministries/new">
            <IconPlus />
            <span className="hidden sm:inline">Add Ministry</span>
          </Link>
        </Button>
      </div>

      <MinistriesFilters
        key={`${search}-${lifeStageId}`}
        lifeStages={lifeStages}
        search={search}
        lifeStageId={lifeStageId}
      />

      <MinistriesTable ministries={ministries} />
    </div>
  )
}
