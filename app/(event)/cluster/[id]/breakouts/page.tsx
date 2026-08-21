import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { AlertTriangle } from "lucide-react"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canWrite } from "@/lib/permissions"
import { ClusterKind } from "@/app/generated/prisma/client"
import { clusterSurface } from "@/lib/breakouts/owner"
import { getClusterBreakoutPool } from "@/lib/clusters/aggregate"
import { ClusterBreakouts } from "./cluster-breakouts"

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

  // Catch Mech follows up on a cluster table through its facilitator: whoever runs
  // it belongs to exactly one member event, and that is the ministry the table's
  // people are endorsed to. A table with nobody on it is endorsed to nobody, so
  // its participants appear on no event's Catch Mech and nobody can confirm them.
  // Assigning a facilitator here is the fix, which is why the warning lives on
  // this page rather than on an event's.
  //
  // Only the two standing roles are checked: `OccurrenceSubFacilitator` is keyed
  // to an event's occurrence and cannot exist on a cluster-owned table.
  const orphanGroups = groups.filter(
    (g) => !g.facilitator && !g.coFacilitator && g._count.members > 0
  )
  const orphanPeople = orphanGroups.reduce((sum, g) => sum + g._count.members, 0)

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      {orphanGroups.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-dashed p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <div className="space-y-0.5 text-sm">
            <p className="font-medium">
              {orphanGroups.length === 1
                ? "1 table has no facilitator"
                : `${orphanGroups.length} tables have no facilitator`}
            </p>
            <p className="text-muted-foreground">
              {orphanPeople === 1 ? "1 person is" : `${orphanPeople} people are`} seated at{" "}
              {orphanGroups.map((g) => g.name).join(", ")}. Catch Mech follows up on a
              table through its facilitator, so until one is assigned these people
              reach no ministry&apos;s follow-up and nobody can confirm them into a DGroup.
            </p>
          </div>
        </div>
      )}
      <ClusterBreakouts
        clusterId={cluster.id}
        surface={clusterSurface(cluster.id)}
        breakoutGroups={rows}
        registrantCount={totalPeople}
        unassignedCount={unseatedPeople}
        volunteers={volunteers}
        lifeStages={lifeStages}
        events={events.map((e) => ({ id: e.id, name: e.name }))}
        canEdit={canEdit}
      />
    </div>
  )
}
