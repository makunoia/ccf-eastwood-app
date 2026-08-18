import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  getAccessibleClusterEvents,
  getClusterDayRows,
} from "@/lib/clusters/aggregate"
import { buildClusterRoster, personTypeFor, standingFor } from "@/lib/clusters/roster"
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
    select: { id: true, name: true, date: true, kind: true },
  })
  if (!cluster) notFound()

  const events = await getAccessibleClusterEvents(session, id)
  // The day's people, not only its registrations: someone serving holds a
  // `Volunteer` row and never an `EventRegistrant` one, and a roster that
  // counted only the latter left the serving team off the day's list entirely.
  const rows = await getClusterDayRows(events, {
    clusterId: cluster.id,
    date: cluster.date,
    kind: cluster.kind,
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
        kind: c.cell!.kind,
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
      type: personTypeFor(person),
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
  // Registrations and sign-ups to serve are counted apart. Both are the day's
  // people, but "40 registered" meaning "31 registered and 9 serving" is the
  // kind of merged figure an admin can't plan from.
  const registrationCount = dayRows.filter((r) => r.kind === "Registrant").length
  const volunteerCount = dayRows.filter((r) => r.kind === "Volunteer").length

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
            {dayPeople} {dayPeople === 1 ? "person" : "people"} ·{" "}
            {registrationCount} registration{registrationCount === 1 ? "" : "s"}
            {volunteerCount > 0 && <> · {volunteerCount} serving</>} across{" "}
            {events.length} event{events.length === 1 ? "" : "s"}
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
