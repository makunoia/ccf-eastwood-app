import "server-only"

import { db } from "@/lib/db"
import type { BreakoutCandidate } from "@/lib/breakout-suggestion"

export async function fetchBreakoutCandidates(
  eventId: string,
  occurrenceId: string | null,
  requireCheckedIn = true
): Promise<BreakoutCandidate[]> {
  const checkedInFilter = requireCheckedIn
    ? occurrenceId !== null
      ? {
          OR: [
            {
              facilitator: {
                member: {
                  eventRegistrations: {
                    some: {
                      eventId,
                      occurrenceAttendances: { some: { occurrenceId } },
                    },
                  },
                },
              },
            },
            {
              coFacilitator: {
                member: {
                  eventRegistrations: {
                    some: {
                      eventId,
                      occurrenceAttendances: { some: { occurrenceId } },
                    },
                  },
                },
              },
            },
            {
              subFacilitators: {
                some: { occurrenceId },
              },
            },
          ],
        }
      : {
          OR: [
            {
              facilitator: {
                member: {
                  eventRegistrations: {
                    some: {
                      eventId,
                      attendedAt: { not: null },
                    },
                  },
                },
              },
            },
            {
              coFacilitator: {
                member: {
                  eventRegistrations: {
                    some: {
                      eventId,
                      attendedAt: { not: null },
                    },
                  },
                },
              },
            },
          ],
        }
    : {}

  const groups = await db.breakoutGroup.findMany({
    where: { eventId, ...checkedInFilter },
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
