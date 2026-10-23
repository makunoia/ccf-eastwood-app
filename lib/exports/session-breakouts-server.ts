import "server-only"
import type { Prisma } from "@/app/generated/prisma/client"
import { eventOwner } from "@/lib/breakouts/owner"
import type { SessionBreakoutSnapshot } from "./session-breakouts"

/** Same event-owned tables as the session detail screen; never another day's pool. */
export async function loadSessionBreakoutGroups(tx: Prisma.TransactionClient, eventId: string, occurrenceIds: string[]) {
  const staffSelect = { memberId: true, member: { select: { firstName: true, lastName: true } } } as const
  return tx.breakoutGroup.findMany({
    where: { ...eventOwner(eventId) },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      name: true,
      facilitator: { select: staffSelect },
      coFacilitator: { select: staffSelect },
      members: { select: { registrantId: true, registrant: { select: { memberId: true, guestId: true } } } },
      subFacilitators: { where: { occurrenceId: { in: occurrenceIds } }, select: {
        occurrenceId: true, role: true, substitute: { select: staffSelect },
      } },
    },
  })
}

export function buildSessionBreakoutSnapshot(
  groups: Awaited<ReturnType<typeof loadSessionBreakoutGroups>>,
  occurrenceId: string,
): SessionBreakoutSnapshot {
  const staff = (volunteer: (typeof groups)[number]["facilitator"]) => volunteer ? {
    memberId: volunteer.memberId,
    name: `${volunteer.member.firstName} ${volunteer.member.lastName}`.trim(),
  } : null
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    groups: groups.map((g) => ({
      name: g.name,
      registrantIds: g.members.map((m) => m.registrantId),
      memberIds: g.members.flatMap((m) => m.registrant.memberId ? [m.registrant.memberId] : []),
      guestIds: g.members.flatMap((m) => m.registrant.guestId ? [m.registrant.guestId] : []),
      facilitator: staff(g.subFacilitators.find((s) => s.occurrenceId === occurrenceId && s.role === "Facilitator")?.substitute ?? g.facilitator),
      coFacilitator: staff(g.subFacilitators.find((s) => s.occurrenceId === occurrenceId && s.role === "CoFacilitator")?.substitute ?? g.coFacilitator),
    })),
  }
}
