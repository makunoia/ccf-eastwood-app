import type { Prisma } from "@/app/generated/prisma/client"

/**
 * Drops the "my DGroup leader is at another CCF satellite" declaration once the
 * leader actually joins a DGroup here.
 *
 * A leader's upward accountability is one thing recorded two ways: either
 * `SmallGroup.parentGroupId`/their own `Member.smallGroupId` (a DGroup at
 * Eastwood), or the satellite — held on `Member.upwardSatellite` and mirrored
 * onto `SmallGroup.parentSatellite` for each group they lead. The two cannot
 * both be true, so joining a group here supersedes the satellite, and both
 * copies of it have to go.
 *
 * **Confirmation, not request.** This deliberately fires when a membership is
 * *confirmed*, never when it is merely requested. A request is an intention: until
 * a leader accepts it, the satellite is still the only true answer, and clearing
 * it on a request that is later rejected would strand the member with no upward
 * record at all.
 *
 * Called from every path that confirms a person into a group — the leader
 * confirmation link, the catch-mech resolver, and the admin couple-confirm — so
 * it takes a transaction client and a batch of ids rather than doing its own
 * write. A no-op for the overwhelming majority of people, who never declared one.
 */
export async function clearUpwardSatelliteOnConfirm(
  tx: Prisma.TransactionClient,
  memberIds: readonly string[]
): Promise<void> {
  if (memberIds.length === 0) return
  const ids = [...memberIds]
  await tx.member.updateMany({
    where: { id: { in: ids }, upwardSatellite: { not: null } },
    data: { upwardSatellite: null },
  })
  await tx.smallGroup.updateMany({
    where: { leaderId: { in: ids }, parentSatellite: { not: null } },
    data: { parentSatellite: null },
  })
}
