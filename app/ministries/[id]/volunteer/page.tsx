import Link from "next/link"
import { notFound } from "next/navigation"
import { format } from "date-fns"
import { db } from "@/lib/db"

async function getData(ministryId: string) {
  const [ministry, upcomingEvents] = await Promise.all([
    db.ministry.findUnique({
      where: { id: ministryId },
      select: { id: true, name: true },
    }),
    db.event.findMany({
      where: {
        ministries: { some: { ministryId } },
        startDate: { gte: new Date() },
      },
      orderBy: { startDate: "asc" },
      select: { id: true, name: true, startDate: true },
    }),
  ])
  return { ministry, upcomingEvents }
}

export default async function MinistryVolunteerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { ministry, upcomingEvents } = await getData(id)
  if (!ministry) notFound()

  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">{ministry.name}</h1>
          <p className="text-muted-foreground text-sm">
            Select an upcoming event to volunteer for.
          </p>
        </div>

        {upcomingEvents.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No upcoming events for this ministry at the moment.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {upcomingEvents.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}/volunteer`}
                className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
              >
                <div>
                  <p className="font-medium">{event.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(event.startDate), "MMMM d, yyyy")}
                  </p>
                </div>
                <span className="text-sm text-muted-foreground">Volunteer →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
