import { db } from "@/lib/db"
import { GuestForm } from "../guest-form"

async function getLifeStages() {
  return db.lifeStage.findMany({
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  })
}

export default async function NewGuestPage() {
  const lifeStages = await getLifeStages()
  return <GuestForm lifeStages={lifeStages} />
}
