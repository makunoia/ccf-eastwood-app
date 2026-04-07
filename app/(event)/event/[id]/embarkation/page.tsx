import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { EmbarkationClient } from "./embarkation-client"

async function getEventEmbarkation(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      modules: { select: { type: true } },
      registrants: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          memberId: true,
          firstName: true,
          lastName: true,
          mobileNumber: true,
          member: { select: { id: true, firstName: true, lastName: true, phone: true } },
          guest: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      volunteers: {
        where: { status: "Confirmed" },
        orderBy: { createdAt: "asc" as const },
        select: {
          id: true,
          member: { select: { id: true, firstName: true, lastName: true } },
          busPassengers: { select: { id: true, busId: true } },
        },
      },
      buses: {
        orderBy: { createdAt: "asc" },
        include: {
          passengers: {
            include: {
              registrant: {
                include: {
                  member: { select: { id: true, firstName: true, lastName: true, phone: true } },
                  guest: { select: { id: true, firstName: true, lastName: true } },
                },
              },
              volunteer: {
                include: {
                  member: { select: { id: true, firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      },
    },
  })
}

export default async function EmbarkationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEventEmbarkation(id)
  if (!event) notFound()

  // Module guard
  const hasEmbarkation = event.modules.some((m) => m.type === "Embarkation")
  if (!hasEmbarkation) notFound()

  return (
    <EmbarkationClient
      eventId={event.id}
      buses={event.buses}
      registrants={event.registrants}
      volunteers={event.volunteers}
    />
  )
}
