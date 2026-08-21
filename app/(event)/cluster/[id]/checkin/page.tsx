import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  getAccessibleClusterEvents,
  getClusterCheckinShortcuts,
  getClusterDayRows,
} from "@/lib/clusters/aggregate"
import { clusterOffersPerEventCheckin } from "@/lib/clusters/checkin-shortcuts"
import { buildClusterRoster } from "@/lib/clusters/roster"
import { canWrite } from "@/lib/permissions"
import { clusterCheckinPath, clusterWalkInPath } from "@/lib/public-routes"
import { DetailPageHeader } from "@/components/detail-page-header"
import { ClusterCheckinClient } from "./checkin-client"
import { ClusterCheckinShortcuts } from "./checkin-shortcuts"

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
    select: {
      id: true,
      date: true,
      kind: true,
      publicToken: true,
      walkInIsOpen: true,
      checkInIsOpen: true,
    },
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
  const rows = await getClusterDayRows(events, {
    clusterId: cluster.id,
    date: cluster.date,
    kind: cluster.kind,
  })
  // Volunteers are on the board too — the public kiosk has always been able to
  // check one in, and a board that couldn't show them disagreed with the screen
  // the staffer at the door was using.
  // The board is the day's arrivals list, so it stays strictly day-scoped: a
  // standing series registrant with no evidence for today is not someone this
  // screen is waiting on. They remain visible on the roster and registrants
  // screens, which describe who is on the books rather than who is expected.
  const roster = buildClusterRoster(
    events,
    rows.filter((r) => r.onClusterDay)
  )

  // Per-event check-in doors — a Parallel day's, and nobody else's; see
  // `clusterOffersPerEventCheckin` for why a Collab day gets none. They cover
  // every accessible event, not just the ones the board can monitor: a MultiDay
  // event still has a check-in link a staffer needs, even though its arrivals
  // are tracked on its own sessions page.
  const perEventDoors = clusterOffersPerEventCheckin(cluster.kind)
  const shortcuts = perEventDoors
    ? await getClusterCheckinShortcuts(accessibleEvents, cluster.date)
    : []
  const writable = canWrite(session, "Events")

  const people = roster.rows.map((person) => {
    const cells = events
      .map((e) => ({ event: e, cell: person.perEvent[e.id] }))
      .filter((c) => c.cell !== undefined)
    return {
      key: person.key,
      name: `${person.firstName} ${person.lastName}`.trim(),
      phone: person.phone,
      isMember: person.isMember,
      isVolunteer: person.isVolunteer,
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
      {/* The two figures live in the subtitle and nowhere else. A pair of stat
          tiles under this header restated "N of M checked in" word for word —
          two rows of chrome saying what the line above them already said, and
          the arrivals list (the only thing on this page that changes) started
          below the fold because of it. */}
      <DetailPageHeader
        title="Check-in"
        subtitle={
          <p className="text-sm text-muted-foreground">
            {perEventDoors
              ? "Live status across the day\u2019s events"
              : "Live status for the day"}{" "}
            — attendance is recorded on the kiosk below ·{" "}
            <span className="font-medium text-foreground tabular-nums">
              {checkedInCount} of {people.length}
            </span>{" "}
            checked in
          </p>
        }
      />

      <div className="flex flex-1 flex-col gap-6 p-6">
        <ClusterCheckinShortcuts
          shortcuts={shortcuts}
          canConfigure={writable}
          // The day's kiosk. Same treatment as the door beside it: hidden from
          // read-only staff because it writes attendance, and swapped for the
          // switch link while closed so the row never dead-ends.
          checkInHref={
            writable && accessibleEvents.length > 0 && cluster.checkInIsOpen
              ? clusterCheckinPath(cluster.publicToken)
              : null
          }
          checkInSettingsHref={
            writable && accessibleEvents.length > 0 && !cluster.checkInIsOpen
              ? `/cluster/${cluster.id}/forms/check-in`
              : null
          }
          // The door link registers and checks someone in across the day in one
          // pass. Hidden from read-only staff: it writes registrations and
          // attendance. Also null while the door is closed (CCF-133) — the
          // switch link takes over, so the button never dead-ends.
          walkInHref={
            writable && accessibleEvents.length > 0 && cluster.walkInIsOpen
              ? clusterWalkInPath(cluster.publicToken)
              : null
          }
          walkInSettingsHref={
            writable && accessibleEvents.length > 0 && !cluster.walkInIsOpen
              ? `/cluster/${cluster.id}/forms/walk-in`
              : null
          }
        />

        <ClusterCheckinClient
          people={people}
          hasCheckinEvents={events.length > 0}
          // A Collab registrant holds exactly one of the day's events, so the
          // per-event badge column is the same word on every row — and the one
          // it isn't is the partner ministry's, which this day is built to stop
          // showing. Collapsed, an arrival is one line.
          showEventBreakdown={perEventDoors}
        />
      </div>
    </>
  )
}
