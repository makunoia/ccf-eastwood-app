import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { utcDayRange } from "@/lib/clusters/aggregate"
import { PageHeader } from "@/components/page-header"
import { ClusterSettingsClient } from "./settings-client"

export const metadata: Metadata = {
  title: "Settings",
}

export default async function ClusterSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const cluster = await db.eventCluster.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      date: true,
      kind: true,
      events: {
        orderBy: { order: "asc" },
        select: {
          occurrenceId: true,
          event: {
            select: {
              id: true,
              name: true,
              type: true,
              startDate: true,
              // Whether this day could answer a collab form's "which ministry are
              // you part of?" — surfaced beside the kind selector so the reason is
              // visible before Save rather than only in a rejection toast.
              allMinistries: true,
              ministries: { select: { ministry: { select: { id: true, name: true } } } },
            },
          },
        },
      },
    },
  })
  if (!cluster) notFound()

  // Who may join: free events, not already in a cluster, and — since a cluster
  // is one day — never MultiDay. A dated cluster further narrows to events that
  // can actually fall on its day: a OneTime event on that date, or a Recurring
  // event with a session on it.
  const dayRange = cluster.date ? utcDayRange(cluster.date) : null
  const candidates = await db.event.findMany({
    where: {
      modules: { none: { type: "Priced" } },
      clusterMembership: null,
      type: { not: "MultiDay" },
      ...(dayRange
        ? {
            OR: [
              { type: "OneTime", startDate: dayRange },
              { type: "Recurring", occurrences: { some: { date: dayRange } } },
            ],
          }
        : {}),
    },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, type: true, startDate: true },
  })

  // Sessions offered for the Recurring events on this screen — the candidates
  // plus anything already linked (so a linked event can be re-pointed). Narrowed
  // to the cluster's day when it has one; otherwise the most recent sessions.
  const recurringIds = [
    ...candidates.filter((e) => e.type === "Recurring").map((e) => e.id),
    ...cluster.events
      .filter((e) => e.event.type === "Recurring")
      .map((e) => e.event.id),
  ]
  const sessions = recurringIds.length
    ? await db.eventOccurrence.findMany({
        where: {
          eventId: { in: recurringIds },
          ...(dayRange ? { date: dayRange } : {}),
        },
        orderBy: { date: "desc" },
        take: dayRange ? undefined : 100,
        select: { id: true, eventId: true, date: true, series: { select: { title: true } } },
      })
    : []

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <PageHeader
        title="Settings"
        description="Cluster details and member events — the shared form lives in Forms"
      />
      <ClusterSettingsClient
        cluster={{
          id: cluster.id,
          name: cluster.name,
          description: cluster.description,
          date: cluster.date?.toISOString() ?? null,
          kind: cluster.kind,
        }}
        events={cluster.events.map((e) => ({
          id: e.event.id,
          name: e.event.name,
          type: e.event.type,
          startDate: e.event.startDate.toISOString(),
          occurrenceId: e.occurrenceId,
          ministryName:
            !e.event.allMinistries && e.event.ministries.length === 1
              ? e.event.ministries[0].ministry.name
              : null,
          ministryCount: e.event.allMinistries ? -1 : e.event.ministries.length,
        }))}
        candidates={candidates.map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          startDate: e.startDate.toISOString(),
          occurrenceId: null,
        }))}
        sessions={sessions.map((s) => ({
          id: s.id,
          eventId: s.eventId,
          date: s.date.toISOString(),
          seriesTitle: s.series?.title ?? null,
        }))}
      />
    </div>
  )
}
