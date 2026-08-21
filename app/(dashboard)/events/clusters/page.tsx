import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canAccessEvent, isSuperAdmin } from "@/lib/permissions"
import { getClusterSharedFormPeopleCounts } from "@/lib/clusters/aggregate"
import { PageHeader } from "@/components/page-header"
import { LinkTabs } from "@/components/link-tabs"
import { ClustersToolbar } from "./create-cluster-dialog"
import { ClustersTable } from "./clusters-table"

export const metadata: Metadata = {
  title: "Event Clusters",
}

export default async function EventClustersPage() {
  const session = await auth()

  const clusters = await db.eventCluster.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      date: true,
      isOpen: true,
      events: {
        orderBy: { order: "asc" },
        select: { eventId: true, event: { select: { name: true } } },
      },
    },
  })

  // A Staff user sees a cluster when they can access at least one member event;
  // an empty cluster is Super Admin's to see (there's nothing scoped inside yet).
  const visible = clusters.filter(
    (c) =>
      isSuperAdmin(session) ||
      c.events.some((e) => canAccessEvent(session, e.eventId))
  )

  const peopleCounts = await getClusterSharedFormPeopleCounts(
    visible.map((c) => c.id)
  )

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <PageHeader
        title="Event Clusters"
        description="Run several events as one day — shared registration, combined monitoring"
        actions={<ClustersToolbar />}
      />

      <LinkTabs
        tabs={[
          { label: "Events", href: "/events", exact: true },
          { label: "Event Clusters", href: "/events/clusters" },
        ]}
      />

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No event clusters yet. Create one to run several events as a single day.
        </div>
      ) : (
        <ClustersTable
          clusters={visible.map((cluster) => ({
            id: cluster.id,
            name: cluster.name,
            date: cluster.date?.toISOString() ?? null,
            isOpen: cluster.isOpen,
            eventNames: cluster.events.map((e) => e.event.name),
            peopleCount: peopleCounts.get(cluster.id) ?? 0,
          }))}
        />
      )}
    </div>
  )
}
