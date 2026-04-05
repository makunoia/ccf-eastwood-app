import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { EventDetail } from "./event-detail"

async function getEvent(id: string) {
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
        },
      },
    },
  })
  if (!event) return null
  return event
}

async function getMinistries() {
  return db.ministry.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [event, ministries] = await Promise.all([getEvent(id), getMinistries()])

  if (!event) notFound()

  return <EventDetail event={event} ministries={ministries} />
}
