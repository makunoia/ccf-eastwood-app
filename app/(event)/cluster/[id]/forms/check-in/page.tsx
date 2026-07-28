import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAccessibleClusterEvents } from "@/lib/clusters/aggregate"
import { PageHeader } from "@/components/page-header"
import { CheckinFormsCard, type ClusterCheckinFormRow } from "../checkin-forms-card"

export const metadata: Metadata = {
  title: "Check-in Forms",
}

export default async function ClusterCheckinFormsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  const { id } = await params
  const cluster = await db.eventCluster.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!cluster) notFound()

  // Each member event's check-in form, with live open-session state for
  // MultiDay/Recurring events (their check-in opens per session).
  const events = await getAccessibleClusterEvents(session, id)
  const sessionEventIds = events.filter((e) => e.type !== "OneTime").map((e) => e.id)
  const openOccurrences =
    sessionEventIds.length > 0
      ? await db.eventOccurrence.findMany({
          where: { eventId: { in: sessionEventIds }, isOpen: true },
          select: { eventId: true },
        })
      : []
  const openByEvent = new Set(openOccurrences.map((o) => o.eventId))
  const rows: ClusterCheckinFormRow[] = events.map((e) => ({
    eventId: e.id,
    eventName: e.name,
    type: e.type,
    hasOpenSession: openByEvent.has(e.id),
  }))

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/cluster/${id}/forms`}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          Forms
        </Link>
        <PageHeader
          title="Check-in Forms"
          description="Every event keeps its own check-in form — the day's links in one place"
        />
      </div>

      <CheckinFormsCard rows={rows} />
    </div>
  )
}
