import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { findOrCreateOccurrence } from "@/app/(dashboard)/events/actions"
import { CheckinBoard } from "./checkin-board"

async function getEventWithRegistrants(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
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
}

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await getEventWithRegistrants(id)
  if (!event) notFound()

  // Recurring: find or create today's occurrence, fetch already-checked-in IDs
  if (event.type === "Recurring") {
    const today = new Date().toISOString().split("T")[0]
    const occurrenceResult = await findOrCreateOccurrence(id, today)
    if (!occurrenceResult.success) {
      throw new Error("Failed to initialise occurrence for today")
    }
    const occurrenceId = occurrenceResult.data.id

    const existing = await db.occurrenceAttendee.findMany({
      where: { occurrenceId },
      select: { registrantId: true },
    })
    const initialCheckedInIds = existing.map((a) => a.registrantId)

    const dateLabel = new Date().toLocaleDateString("en-PH", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    })

    return (
      <div className="min-h-svh bg-background">
        <div className="border-b px-4 py-4">
          <h1 className="text-lg font-semibold">{event.name}</h1>
          <p className="text-sm text-muted-foreground">
            {event.ministry.name} · Check-in · {dateLabel}
          </p>
        </div>
        <CheckinBoard
          eventId={event.id}
          registrants={event.registrants}
          occurrenceId={occurrenceId}
          initialCheckedInIds={initialCheckedInIds}
        />
      </div>
    )
  }

  // OneTime / MultiDay — unchanged behaviour
  return (
    <div className="min-h-svh bg-background">
      <div className="border-b px-4 py-4">
        <h1 className="text-lg font-semibold">{event.name}</h1>
        <p className="text-sm text-muted-foreground">
          {event.ministry.name} · Check-in
        </p>
      </div>
      <CheckinBoard
        eventId={event.id}
        registrants={event.registrants}
        occurrenceId={null}
        initialCheckedInIds={[]}
      />
    </div>
  )
}
