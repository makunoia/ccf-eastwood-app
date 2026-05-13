import "server-only"

import { db } from "@/lib/db"
import type { BreakoutCandidate } from "@/lib/breakout-suggestion"

export async function fetchBreakoutCandidates(eventId: string): Promise<BreakoutCandidate[]> {
  const groups = await db.breakoutGroup.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      genderFocus: true,
      ageRangeMin: true,
      ageRangeMax: true,
      memberLimit: true,
      _count: { select: { members: true } },
    },
  })
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    genderFocus: g.genderFocus,
    ageRangeMin: g.ageRangeMin,
    ageRangeMax: g.ageRangeMax,
    memberLimit: g.memberLimit,
    memberCount: g._count.members,
  }))
}
