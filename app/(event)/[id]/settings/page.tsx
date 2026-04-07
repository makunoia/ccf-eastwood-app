import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { EventSettingsClient } from "./settings-client"

async function getEventSettings(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      modules: { select: { id: true, type: true } },
      buses: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          capacity: true,
          direction: true,
          _count: { select: { passengers: true } },
        },
      },
      committees: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          roles: {
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true },
          },
        },
      },
    },
  })
}

export default async function EventSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEventSettings(id)
  if (!event) notFound()

  // Embarkation module is only applicable for OneTime/MultiDay events
  const showEmbarkation = event.type !== "Recurring"

  return (
    <EventSettingsClient
      eventId={event.id}
      enabledModules={event.modules.map((m) => m.type)}
      buses={event.buses}
      committees={event.committees}
      showEmbarkation={showEmbarkation}
    />
  )
}
