import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
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
      events: {
        orderBy: { order: "asc" },
        select: {
          event: { select: { id: true, name: true, type: true, startDate: true } },
        },
      },
    },
  })
  if (!cluster) notFound()

  // Only free events that aren't already in a cluster can join (paid events keep
  // their own registration form; one cluster per event).
  const candidates = await db.event.findMany({
    where: {
      modules: { none: { type: "Priced" } },
      clusterMembership: null,
    },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, type: true, startDate: true },
  })

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
        }}
        events={cluster.events.map((e) => ({
          id: e.event.id,
          name: e.event.name,
          type: e.event.type,
          startDate: e.event.startDate.toISOString(),
        }))}
        candidates={candidates.map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          startDate: e.startDate.toISOString(),
        }))}
      />
    </div>
  )
}
