import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { EventSettingsClient } from "./event-settings-client"

async function getEventSettings(id: string) {
  const event = await db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
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
  return event ?? null
}

export default async function EventSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEventSettings(id)
  if (!event) notFound()

  const enabledModules = event.modules.map((m) => m.type)

  return (
    <EventSettingsClient
      eventId={event.id}
      eventName={event.name}
      enabledModules={enabledModules}
      buses={event.buses}
      committees={event.committees}
    />
  )
}
