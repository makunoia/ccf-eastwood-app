import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { CheckinBoard } from "./checkin-board"

async function getEventWithRegistrants(id: string) {
  const event = await db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      startDate: true,
      ministry: { select: { name: true } },
      registrants: {
        orderBy: { createdAt: "asc" },
        include: {
          member: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
          guest: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
        },
      },
    },
  })
  return event ?? null
}

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEventWithRegistrants(id)
  if (!event) notFound()

  return (
    <div className="min-h-svh bg-background">
      <div className="border-b px-4 py-4">
        <h1 className="text-lg font-semibold">{event.name}</h1>
        <p className="text-sm text-muted-foreground">
          {event.ministry.name} · Check-in
        </p>
      </div>
      <CheckinBoard eventId={event.id} registrants={event.registrants} />
    </div>
  )
}
