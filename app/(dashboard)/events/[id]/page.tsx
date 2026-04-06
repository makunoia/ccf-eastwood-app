import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { EventDetail } from "./event-detail"
import { RecurringEventDetail } from "./recurring-event-detail"

async function getEventType(id: string) {
  return db.event.findUnique({ where: { id }, select: { id: true, type: true } })
}

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
          guest: {
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

async function getRecurringEvent(id: string) {
  const event = await db.event.findUnique({
    where: { id },
    include: {
      ministry: { select: { id: true, name: true } },
      registrants: {
        orderBy: { createdAt: "asc" },
        include: {
          member: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
          guest: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
        },
      },
      occurrences: {
        orderBy: { date: "desc" },
        include: {
          _count: { select: { attendees: true } },
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
  const probe = await getEventType(id)
  if (!probe) notFound()

  if (probe.type === "Recurring") {
    const event = await getRecurringEvent(id)
    if (!event) notFound()
    return <RecurringEventDetail event={event} />
  }

  const event = await getEvent(id)
  if (!event) notFound()
  return <EventDetail event={event} />
}
