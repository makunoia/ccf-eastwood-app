import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { IconArrowLeft } from "@tabler/icons-react"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getAccessibleClusterEvents } from "@/lib/clusters/aggregate"
import { clusterCheckinPath } from "@/lib/public-routes"
import { PageHeader } from "@/components/page-header"
import { CheckinFormsCard, type ClusterCheckinFormRow } from "../checkin-forms-card"
import { ClusterCheckInAccess } from "./check-in-access"

export const metadata: Metadata = {
  title: "Check-in",
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
    select: { id: true, publicToken: true, checkInIsOpen: true },
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

  // The Public access switch, which only OneTime events have — session-based
  // check-in is governed per occurrence instead. A missing row means open, so
  // only explicit `isOpen: false` rows count as closed.
  const oneTimeEventIds = events.filter((e) => e.type === "OneTime").map((e) => e.id)
  const closedConfigs =
    oneTimeEventIds.length > 0
      ? await db.formConfig.findMany({
          where: { key: "EventCheckIn", eventId: { in: oneTimeEventIds }, isOpen: false },
          select: { eventId: true },
        })
      : []
  const closedEventIds = new Set(closedConfigs.map((c) => c.eventId))

  const rows: ClusterCheckinFormRow[] = events.map((e) => ({
    eventId: e.id,
    eventName: e.name,
    type: e.type,
    hasOpenSession: openByEvent.has(e.id),
    isFormOpen: !closedEventIds.has(e.id),
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
          title="Check-in"
          description="One kiosk for the whole day, plus each event's own check-in form"
        />
      </div>

      <ClusterCheckInAccess
        clusterId={cluster.id}
        publicPath={clusterCheckinPath(cluster.publicToken)}
        initialIsOpen={cluster.checkInIsOpen}
      />

      {/* The per-event kiosks still exist and the board's Shortcuts still point
          at them — an event that hasn't opened its own form is skipped by the
          day's kiosk, and this is where that gets fixed. */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Each event&apos;s own check-in form</h2>
        <CheckinFormsCard rows={rows} />
      </div>
    </div>
  )
}
