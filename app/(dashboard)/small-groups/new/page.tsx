import { db } from "@/lib/db"
import { SmallGroupForm } from "../small-group-form"

async function getData() {
  const [members, smallGroups, lifeStages, statuses] = await Promise.all([
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
    db.smallGroupStatus.findMany({
      orderBy: { order: "asc" },
      select: { id: true, name: true, order: true },
    }),
  ])
  return { members, smallGroups, lifeStages, statuses }
}

export default async function NewSmallGroupPage() {
  const { members, smallGroups, lifeStages, statuses } = await getData()
  return (
    <SmallGroupForm
      members={members}
      smallGroups={smallGroups}
      lifeStages={lifeStages}
      statuses={statuses}
    />
  )
}
