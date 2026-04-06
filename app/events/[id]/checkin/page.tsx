import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { CheckinBoard } from "./checkin-board"

async function getEventWithRegistrants(id: string) {
  return db.event.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      startDate: true,
      ministries: { select: { ministry: { select: { name: true } } } },
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

  // Recurring and MultiDay events use per-occurrence/per-day check-in links
  if (event.type === "Recurring" || event.type === "MultiDay") {
    return (
      <div className="min-h-svh bg-background">
        <div className="border-b px-4 py-4">
          <h1 className="text-lg font-semibold">{event.name}</h1>
          <p className="text-sm text-muted-foreground">
            {event.ministries.map((em) => em.ministry.name).join(" · ")}{event.ministries.length > 0 ? " · " : ""}Check-in
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
          <p className="font-medium text-sm">
            {event.type === "MultiDay" ? "Use the day check-in link" : "Use the session check-in link"}
          </p>
          <p className="text-sm text-muted-foreground">
            {event.type === "MultiDay"
              ? "Each day has its own check-in link. Copy it from the event page in the admin dashboard."
              : "Each session has its own check-in link. Copy it from the event page in the admin dashboard."}
          </p>
        </div>
      </div>
    )
  }

  // OneTime
  return (
    <div className="min-h-svh bg-background">
      <div className="border-b px-4 py-4">
        <h1 className="text-lg font-semibold">{event.name}</h1>
        <p className="text-sm text-muted-foreground">
          {event.ministries.map((em) => em.ministry.name).join(" · ")}{event.ministries.length > 0 ? " · " : ""}Check-in
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
