import { db } from "@/lib/db"
import { SmallGroupForm } from "../small-group-form"

async function getData() {
  const [members, smallGroups, lifeStages] = await Promise.all([
    db.member.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, smallGroupId: true },
    }),
    db.smallGroup.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.lifeStage.findMany({
      orderBy: { order: "asc" },
      select: { id: true, name: true },
    }),
  ])
  return { members, smallGroups, lifeStages }
}

export default async function NewSmallGroupPage() {
  const { members, smallGroups, lifeStages } = await getData()
  return (
    <SmallGroupForm
      members={members}
      smallGroups={smallGroups}
      lifeStages={lifeStages}
    />
  )
}
