import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  getAccessibleClusterEvents,
  getClusterRegistrantRows,
} from "@/lib/clusters/aggregate"
import { buildClusterRoster, standingFor } from "@/lib/clusters/roster"
import { canExport } from "@/lib/permissions"
import { DetailPageHeader } from "@/components/detail-page-header"
import { ClusterExportButton } from "./cluster-export-button"
import { ClusterRegistrantsClient } from "./registrants-client"

export const metadata: Metadata = {
  title: "Registrants",
}

export default async function ClusterRegistrantsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  const { id } = await params

  const cluster = await db.eventCluster.findUnique({
    where: { id },
    select: { id: true, name: true, date: true },
  })
  if (!cluster) notFound()

  const events = await getAccessibleClusterEvents(session, id)
  const rows = await getClusterRegistrantRows(events, {
    clusterId: cluster.id,
    date: cluster.date,
  })
  const roster = buildClusterRoster(events, rows)
  const registeredAtById = new Map(rows.map((r) => [r.id, r.registeredAt]))

  // One entry per PERSON — their registrations across the day's events become
  // chips on the row rather than duplicate rows.
  const people = roster.rows.map((person) => {
    const personEvents = events
      .map((e) => ({ event: e, cell: person.perEvent[e.id] }))
      .filter((c) => c.cell !== undefined)
      .map((c) => ({
        eventId: c.event.id,
        eventName: c.event.name,
        registrantId: c.cell!.registrantId,
        checkedIn: c.cell!.checkedIn,
        standing: standingFor(c.cell!),
      }))
    // "Registered" describes the day when the person has any part in it, so a
    // series-only registration can't drag the timestamp back to whenever they
    // joined the series. Only someone with nothing else falls back to it.
    const dated = (only: boolean) =>
      personEvents
        .filter((e) => !only || e.standing !== "SeriesOnly")
        .map((e) => registeredAtById.get(e.registrantId))
        .filter((d): d is Date => d !== undefined)
        .sort((a, b) => a.getTime() - b.getTime())[0]
    const earliest = dated(true) ?? dated(false)
    return {
      key: person.key,
      firstName: person.firstName,
      lastName: person.lastName,
      phone: person.phone,
      isMember: person.isMember,
      events: personEvents,
      registeredAt: earliest?.toISOString() ?? null,
    }
  })

  // The header describes the DAY, so it counts only what belongs to it — the
  // series-only people are listed below but tallied separately.
  const dayRows = rows.filter((r) => r.onClusterDay)
  const dayPeople = people.filter((p) =>
    p.events.some((e) => e.standing !== "SeriesOnly")
  ).length
  const seriesOnlyPeople = people.length - dayPeople

  const exportDate = (cluster.date ?? new Date()).toISOString().split("T")[0]
  const exportSlug =
    cluster.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "cluster"

  return (
    <>
      <DetailPageHeader
        title="Registrants"
        action={
          canExport(session, "Events") ? (
            <ClusterExportButton
              clusterId={cluster.id}
              filename={`${exportSlug}-registrations-${exportDate}`}
              disabled={rows.length === 0}
            />
          ) : null
        }
        subtitle={
          <p className="text-sm text-muted-foreground">
            {dayPeople} {dayPeople === 1 ? "person" : "people"} · {dayRows.length}{" "}
            registration{dayRows.length === 1 ? "" : "s"} across {events.length}{" "}
            event{events.length === 1 ? "" : "s"}
            {seriesOnlyPeople > 0 && (
              <> · {seriesOnlyPeople} more on a recurring event&apos;s series</>
            )}
          </p>
        }
      />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <ClusterRegistrantsClient
          people={people}
          events={events.map((e) => ({ id: e.id, name: e.name }))}
        />
      </div>
    </>
  )
}
