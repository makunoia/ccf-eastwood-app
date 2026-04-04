import Link from "next/link"
import { IconPlus } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { db } from "@/lib/db"
import { type MinistryRow } from "./columns"
import { MinistriesTable } from "./ministries-table"

async function getMinistries(): Promise<MinistryRow[]> {
  const ministries = await db.ministry.findMany({
    orderBy: { name: "asc" },
    include: {
      lifeStage: { select: { id: true, name: true } },
      _count: {
        select: {
          volunteers: true,
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
    volunteerCount: m._count.volunteers,
    eventCount: m._count.events,
  }))
}

export default async function MinistriesPage() {
  const ministries = await getMinistries()

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Ministries</h2>
          <p className="text-sm text-muted-foreground">
            Manage church ministry departments
          </p>
        </div>
        <Button asChild>
          <Link href="/ministries/new">
            <IconPlus />
            Add Ministry
          </Link>
        </Button>
      </div>

      <MinistriesTable ministries={ministries} />
    </div>
  )
}
