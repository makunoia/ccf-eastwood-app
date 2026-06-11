import { db } from "@/lib/db"
import { type LifeStageRow } from "./columns"
import { LifeStagesTable } from "./life-stages-table"
import { LifeStagesToolbar } from "./toolbar"
import { PageHeader } from "@/components/page-header"

async function getLifeStages(): Promise<LifeStageRow[]> {
  const lifeStages = await db.lifeStage.findMany({
    orderBy: { order: "asc" },
    select: { id: true, name: true, order: true },
  })
  return lifeStages
}

export default async function LifeStagesPage() {
  const lifeStages = await getLifeStages()

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <PageHeader
        title="Life Stages"
        description="Configure the life stage categories used for members and ministries"
        actions={<LifeStagesToolbar />}
      />

      <LifeStagesTable lifeStages={lifeStages} />
    </div>
  )
}
