import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { EventForm } from "../../event-form"
import { type EventRow } from "../../columns"

async function getEvent(id: string): Promise<EventRow | null> {
  const e = await db.event.findUnique({
    where: { id },
    include: { ministry: { select: { id: true, name: true } } },
  })
  if (!e) return null
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    ministry: e.ministry.name,
    ministryId: e.ministryId,
    startDate: e.startDate.toISOString().split("T")[0],
    endDate: e.endDate.toISOString().split("T")[0],
    price: e.price,
    registrationStart: e.registrationStart
      ? e.registrationStart.toISOString().split("T")[0]
      : null,
    registrationEnd: e.registrationEnd
      ? e.registrationEnd.toISOString().split("T")[0]
      : null,
    registrantCount: 0,
  }
}

async function getMinistries() {
  return db.ministry.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  })
}

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [event, ministries] = await Promise.all([getEvent(id), getMinistries()])
  if (!event) notFound()
  return <EventForm event={event} ministries={ministries} />
}
