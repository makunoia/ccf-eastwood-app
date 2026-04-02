import { db } from "@/lib/db"
import { MemberForm } from "../member-form"

async function getLifeStages() {
  return db.lifeStage.findMany({
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  })
}

export default async function NewMemberPage() {
  const lifeStages = await getLifeStages()
  return <MemberForm lifeStages={lifeStages} />
}
