import type { Prisma } from "@/app/generated/prisma/client"
import { ClusterKind } from "@/app/generated/prisma/client"
import type { BreakoutOwner } from "@/lib/breakouts/owner"
import { resolvePoolScope, type PoolScope } from "@/lib/events/pool-scope"

/**
 * Which breakout tables an event's Catch Mech follows up on.
 *
 * Catch Mech is an EVENT-level feature and stays one — there is deliberately no
 * cluster-level Catch Mech. But under a Collab cluster the day's tables belong to
 * the cluster, not to any member event, so scoping on a bare `eventId` finds only
 * the event's standing tables, which nobody sat at.
 *
 * The bridge is the facilitator. `Volunteer.eventId` is required, so whoever runs
 * a table belongs to exactly one member event, and that is the ministry the
 * table's follow-up is endorsed to. A table staffed from two ministries shows up
 * on both — which needs no special handling, because `resolveCatchMechTargets`
 * already gives the linked DGroup only to the lead and sends anyone else to their
 * own groups, and `hidesPerson` already scopes decisions per facilitator.
 *
 * Substitutes count too: they can submit for a table, so their ministry's admin
 * has to be able to see it.
 *
 * Outside a Collab this degenerates to `{ eventId }` — exactly what every Catch
 * Mech query did before this module existed.
 */
export type CatchMechScope = {
  /**
   * Filter for the breakout tables in scope. Combine with `AND` rather than
   * spreading — the Collab branch is itself an `OR` over the staffing roles.
   */
  where: Prisma.BreakoutGroupWhereInput
  /**
   * Who owns ALL of the day's tables, endorsed to this event or not. Wider than
   * `where`: use it to ask owner-level questions like "who is seated nowhere".
   */
  owner: BreakoutOwner
  /** True when these are cluster-owned tables endorsed to this event. */
  viaCluster: boolean
  clusterId: string | null
  clusterName: string | null
}

/**
 * Pure derivation — exported so the branch can be unit-tested without a database.
 */
export function catchMechScopeFor(scope: PoolScope): CatchMechScope {
  if (scope.kind !== ClusterKind.Collab || !scope.clusterId) {
    return {
      where: { eventId: scope.eventId },
      owner: scope.breakoutOwner,
      viaCluster: false,
      clusterId: scope.clusterId,
      clusterName: scope.clusterName,
    }
  }

  const eventId = scope.eventId
  return {
    where: {
      clusterId: scope.clusterId,
      OR: [
        { facilitator: { eventId } },
        { coFacilitator: { eventId } },
        { subFacilitators: { some: { substitute: { eventId } } } },
      ],
    },
    owner: scope.breakoutOwner,
    viaCluster: true,
    clusterId: scope.clusterId,
    clusterName: scope.clusterName,
  }
}

export async function resolveCatchMechScope(eventId: string): Promise<CatchMechScope> {
  return catchMechScopeFor(await resolvePoolScope(eventId))
}
