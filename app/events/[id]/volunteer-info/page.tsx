import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { VolunteerInfoForm } from "./volunteer-info-form"

async function getPageData(id: string) {
  const [event, lifeStages] = await Promise.all([
    db.event.findUnique({
      where: { id },
      select: { id: true, name: true },
    }),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ])
  return { event, lifeStages }
}

export default async function VolunteerInfoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { event, lifeStages } = await getPageData(id)
  if (!event) notFound()

  return (
    <div className="min-h-svh bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6 py-8">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">{event.name}</h1>
          <p className="text-sm text-muted-foreground">Volunteer Information Update</p>
        </div>
        <VolunteerInfoForm eventId={id} lifeStages={lifeStages} />
      </div>
    </div>
  )
}
