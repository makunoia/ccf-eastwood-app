import type { Prisma } from "@/app/generated/prisma/client"
import { anyOwner } from "@/lib/breakouts/owner"
import { resolvePoolScope, type PoolScope } from "@/lib/events/pool-scope"

/**
 * Which breakout tables an event's Catch Mech follows up on.
 *
 * Catch Mech is an Event-level feature. Collab groups are deliberately local to
 * their collab workspace and are never exposed through an Event's follow-up.
 */
export type CatchMechScope = {
  /**
   * Filter for the breakout tables whose follow-up belongs to this event.
   * Combine with `AND` rather than spreading — under a Collab this is itself an
   * `OR`, and two `OR` keys in one object silently overwrite each other.
   */
  where: Prisma.BreakoutGroupWhereInput
  /**
   * Every table someone here could be sitting at, endorsed to this event or not.
   * Wider than `where`: use it to ask "who is seated nowhere", where a person at
   * another ministry's table on the same day is seated, not unseated.
   */
  seatedWhere: Prisma.BreakoutGroupWhereInput
  /** True when the day's cluster-owned tables are part of the scope. */
  viaCluster: boolean
  clusterId: string | null
  clusterName: string | null
}

/**
 * Pure derivation — exported so the branch can be unit-tested without a database.
 */
export function catchMechScopeFor(scope: PoolScope): CatchMechScope {
  const own = scope.breakoutOwner
  return {
    where: anyOwner([own]),
    seatedWhere: anyOwner([own]),
    viaCluster: false,
    clusterId: null,
    clusterName: null,
  }
}

export async function resolveCatchMechScope(eventId: string): Promise<CatchMechScope> {
  return catchMechScopeFor(await resolvePoolScope(eventId))
}
