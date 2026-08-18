import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import { ClusterKind } from "@/app/generated/prisma/client"
import { clusterSurface } from "@/lib/breakouts/owner"
import { getClusterBreakoutPool } from "@/lib/clusters/aggregate"
import { BreakoutGroupsTable } from "@/app/(event)/event/[id]/breakouts/breakout-group"
import { CarryOverBreakoutsCard } from "./carry-over-card"

export const metadata: Metadata = {
  title: "Breakouts",
}

/**
 * A Collab day's breakout groups (CCF-148).
 *
 * These belong to the CLUSTER, not to either ministry's event, and the page opens
 * empty on purpose: the usual thing a collab wants is a fresh distribution set up
 * for that session rather than either ministry's standing tables. Carry over is
 * the escape hatch when the tables should come across.
 *
 * Reuses `BreakoutGroupsTable` from the event workspace rather than forking it —
 * the table takes a `BreakoutSurface`, so the same component edits cluster-owned
 * and event-owned groups through the same server actions.
 */
export default async function ClusterBreakoutsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [session, cluster, lifeStages] = await Promise.all([
    auth(),
    db.eventCluster.findUnique({
      where: { id },
      select: { id: true, name: true, kind: true },
    }),
    db.lifeStage.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ])
  if (!cluster) notFound()

  // Only a collab owns tables. A Parallel day is several independent events, each
  // running its own — sending someone here would offer them a set nothing reads.
  if (cluster.kind !== ClusterKind.Collab) notFound()

  const { groups, volunteers, unseatedPeople, totalPeople, events } =
    await getClusterBreakoutPool(session, id)

  const canEdit = canWrite(session, "Events")

  const rows = groups.map((g) => ({ ...g, memberCount: g._count.members }))

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      {canEdit && (
        <CarryOverBreakoutsCard
          clusterId={cluster.id}
          events={events.map((e) => ({ id: e.id, name: e.name }))}
          hasGroups={groups.length > 0}
        />
      )}
      <BreakoutGroupsTable
        surface={clusterSurface(cluster.id)}
        breakoutGroups={rows}
        registrantCount={totalPeople}
        unassignedCount={unseatedPeople}
        volunteers={volunteers}
        lifeStages={lifeStages}
      />
    </div>
  )
}
