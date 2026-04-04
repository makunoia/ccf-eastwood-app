import { db } from "@/lib/db"
import { MinistryForm } from "../ministry-form"

async function getLifeStages() {
  return db.lifeStage.findMany({
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  })
}

export default async function NewMinistryPage() {
  const lifeStages = await getLifeStages()
  return <MinistryForm lifeStages={lifeStages} />
}
