import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  getAccessibleClusterEvents,
  getClusterRegistrantRows,
} from "@/lib/clusters/aggregate"
import { buildClusterRoster } from "@/lib/clusters/roster"
import { DetailPageHeader } from "@/components/detail-page-header"
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
    select: { id: true, date: true },
  })
  if (!cluster) notFound()

  const events = await getAccessibleClusterEvents(session, id)
  const rows = await getClusterRegistrantRows(
    events.map((e) => e.id),
    cluster.date
  )
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
      }))
    const earliest = personEvents
      .map((e) => registeredAtById.get(e.registrantId))
      .filter((d): d is Date => d !== undefined)
      .sort((a, b) => a.getTime() - b.getTime())[0]
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

  return (
    <>
      <DetailPageHeader
        title="Registrants"
        subtitle={
          <p className="text-sm text-muted-foreground">
            {people.length} {people.length === 1 ? "person" : "people"} ·{" "}
            {rows.length} registration{rows.length === 1 ? "" : "s"} across{" "}
            {events.length} event{events.length === 1 ? "" : "s"}
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
