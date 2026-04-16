import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { CheckinBoard } from "../checkin-board"

async function getOccurrenceWithEvent(occurrenceId: string) {
  return db.eventOccurrence.findUnique({
    where: { id: occurrenceId },
    select: {
      id: true,
      date: true,
      isOpen: true,
      event: {
        select: {
          id: true,
          name: true,
          type: true,
          ministries: { select: { ministry: { select: { name: true } } } },
        },
      },
    },
  })
}

async function getLifeStages() {
  return db.lifeStage.findMany({
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  })
}

export default async function OccurrenceCheckinPage({
  params,
}: {
  params: Promise<{ id: string; occurrenceId: string }>
}) {
  const { id, occurrenceId } = await params
  const [occurrence, lifeStages] = await Promise.all([
    getOccurrenceWithEvent(occurrenceId),
    getLifeStages(),
  ])

  if (!occurrence || occurrence.event.id !== id || occurrence.event.type === "OneTime") {
    notFound()
  }

  const dateLabel = occurrence.date.toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })

  // Date gate: only allow check-in on the occurrence's date
  const today = new Date().toISOString().split("T")[0]
  const occurrenceDate = occurrence.date.toISOString().split("T")[0]

  if (today !== occurrenceDate && !occurrence.isOpen) {
    return (
      <div className="min-h-svh bg-background">
        <div className="border-b px-4 py-4">
          <h1 className="text-lg font-semibold">{occurrence.event.name}</h1>
          <p className="text-sm text-muted-foreground">
            {occurrence.event.ministries.map((em) => em.ministry.name).join(" · ")}
            {occurrence.event.ministries.length > 0 ? " · " : ""}Check-in · {dateLabel}
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
          <p className="font-medium text-sm">Check-in not available</p>
          <p className="text-sm text-muted-foreground">
            This check-in link is only active on {dateLabel}.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-background">
      <div className="border-b px-4 py-4">
        <h1 className="text-lg font-semibold">{occurrence.event.name}</h1>
        <p className="text-sm text-muted-foreground">
          {occurrence.event.ministries.map((em) => em.ministry.name).join(" · ")}
          {occurrence.event.ministries.length > 0 ? " · " : ""}Check-in · {dateLabel}
        </p>
      </div>
      <CheckinBoard
        eventId={id}
        occurrenceId={occurrenceId}
        lifeStages={lifeStages}
        isRecurring={occurrence.event.type === "Recurring"}
      />
    </div>
  )
}
