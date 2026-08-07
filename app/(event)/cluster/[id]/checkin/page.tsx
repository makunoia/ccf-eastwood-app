import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { IconUserCheck, IconUsers } from "@tabler/icons-react"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  getAccessibleClusterEvents,
  getClusterRegistrantRows,
} from "@/lib/clusters/aggregate"
import { buildClusterRoster } from "@/lib/clusters/roster"
import { canWrite } from "@/lib/permissions"
import { clusterWalkInPath } from "@/lib/public-routes"
import { DetailPageHeader } from "@/components/detail-page-header"
import { StatCard } from "@/components/session-stat-card"
import { ClusterCheckinClient } from "./checkin-client"

export const metadata: Metadata = {
  title: "Check-in",
}

export default async function ClusterCheckinPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  const { id } = await params

  const cluster = await db.eventCluster.findUnique({
    where: { id },
    select: { id: true, date: true, publicToken: true, walkInIsOpen: true },
  })
  if (!cluster) notFound()

  const accessibleEvents = await getAccessibleClusterEvents(session, id)
  // The status board covers OneTime events and Recurring events whose link
  // names a session — for those, "checked in" means checked into THAT session.
  // Recurring events without a linked session (legacy links) stay on their own
  // sessions pages, as do MultiDay events.
  const events = accessibleEvents.filter(
    (e) => e.type === "OneTime" || (e.type === "Recurring" && e.linkedOccurrenceId)
  )
  const rows = await getClusterRegistrantRows(events, {
    clusterId: cluster.id,
    date: cluster.date,
  })
  const roster = buildClusterRoster(events, rows)

  const people = roster.rows.map((person) => {
    const cells = events
      .map((e) => ({ event: e, cell: person.perEvent[e.id] }))
      .filter((c) => c.cell !== undefined)
    return {
      key: person.key,
      name: `${person.firstName} ${person.lastName}`.trim(),
      phone: person.phone,
      isMember: person.isMember,
      events: cells.map((c) => ({
        eventId: c.event.id,
        eventName: c.event.name,
        checkedIn: c.cell!.checkedIn,
      })),
      fullyCheckedIn: cells.length > 0 && cells.every((c) => c.cell!.checkedIn),
    }
  })

  const checkedInCount = people.filter((p) =>
    p.events.some((e) => e.checkedIn)
  ).length

  return (
    <>
      <DetailPageHeader
        title="Check-in"
        subtitle={
          <p className="text-sm text-muted-foreground">
            Live status across the day&apos;s events — check-in happens on each
            event&apos;s own form · {checkedInCount} of {people.length} checked in
          </p>
        }
      />

      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Registered"
            value={people.length}
            icon={<IconUsers className="size-4" />}
          />
          <StatCard
            label="Checked in"
            value={checkedInCount}
            icon={<IconUserCheck className="size-4" />}
          />
        </div>

        <ClusterCheckinClient
          people={people}
          hasCheckinEvents={events.length > 0}
          // The door link registers and checks someone in across the day in one
          // pass — worth a shortcut from the board a staffer is already holding.
          // Hidden from read-only staff: it writes registrations and attendance.
          // Also null while the door is closed (CCF-133) — the switch link below
          // takes over, so the button never dead-ends.
          walkInHref={
            canWrite(session, "Events") &&
            accessibleEvents.length > 0 &&
            cluster.walkInIsOpen
              ? clusterWalkInPath(cluster.publicToken)
              : null
          }
          walkInSettingsHref={
            canWrite(session, "Events") &&
            accessibleEvents.length > 0 &&
            !cluster.walkInIsOpen
              ? `/cluster/${cluster.id}/forms/walk-in`
              : null
          }
        />
      </div>
    </>
  )
}
