import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { EventDetail } from "./event-detail"

async function getEvent(id: string) {
  const event = await db.event.findUnique({
    where: { id },
    include: {
      ministry: { select: { id: true, name: true } },
      modules: { select: { type: true } },
      registrants: {
        orderBy: { createdAt: "asc" },
        include: {
          member: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
          baptismOptIn: { select: { id: true } },
        },
      },
      baptismOptIns: { select: { registrantId: true } },
      buses: {
        orderBy: { createdAt: "asc" },
        include: {
          passengers: {
            include: {
              registrant: {
                include: {
                  member: { select: { id: true, firstName: true, lastName: true, phone: true } },
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
      volunteers: {
        where: { status: "Confirmed" },
        include: {
          member: { select: { id: true, firstName: true, lastName: true } },
          busPassengers: { select: { id: true, busId: true } },
        },
      },
    },
  })
  if (!event) return null
  return event
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEvent(id)
  if (!event) notFound()
  return <EventDetail event={event} />
}
