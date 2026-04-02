import { db } from "@/lib/db"
import { type LifeStageRow } from "./columns"
import { LifeStagesTable } from "./life-stages-table"
import { LifeStagesToolbar } from "./toolbar"

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Life Stages</h2>
          <p className="text-sm text-muted-foreground">
            Configure the life stage categories used for members and ministries
          </p>
        </div>
        <LifeStagesToolbar />
      </div>

      <LifeStagesTable lifeStages={lifeStages} />
    </div>
  )
}
