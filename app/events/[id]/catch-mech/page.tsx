import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { CatchMechEntryForm } from "./catch-mech-entry-form"

async function getEventData(id: string) {
  const event = await db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      modules: { select: { type: true } },
      breakoutGroups: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          facilitatorId: true,
          coFacilitatorId: true,
        },
      },
    },
  })
  if (!event) return null
  if (!event.modules.some((m) => m.type === "CatchMech")) return null
  return event
}

export default async function CatchMechEntryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEventData(id)
  if (!event) notFound()

  const groups = event.breakoutGroups.filter(
    (g) => g.facilitatorId || g.coFacilitatorId
  )

  return (
    <div className="min-h-svh bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="type-headline">{event.name}</h1>
          <p className="text-sm text-muted-foreground">Catch Mech — Facilitator Check-in</p>
        </div>
        <CatchMechEntryForm eventId={id} groups={groups} />
      </div>
    </div>
  )
}
