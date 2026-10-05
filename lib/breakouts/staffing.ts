import { db } from "@/lib/db"
import type { Prisma } from "@/app/generated/prisma/client"

/** Substitutes replace the standing facilitator for this session only. */
export async function isBreakoutStaff(memberId: string, groups: Prisma.BreakoutGroupWhereInput, occurrenceId?: string | null) {
  const rows = await db.breakoutGroup.findMany({ where: { AND: [groups, { OR: [
    { facilitator: { memberId } }, { coFacilitator: { memberId } },
    ...(occurrenceId ? [{ subFacilitators: { some: { occurrenceId, substitute: { memberId } } } }] : []),
  ] }] }, select: { facilitator: { select: { memberId: true } }, coFacilitator: { select: { memberId: true } },
    subFacilitators: { where: occurrenceId ? { occurrenceId } : { id: "__no_session__" }, select: { role: true, substitute: { select: { memberId: true } } } } } })
  return rows.some((g) => g.subFacilitators.some((s) => s.substitute.memberId === memberId)
    || (g.facilitator?.memberId === memberId && !g.subFacilitators.some((s) => s.role === "Facilitator"))
    || (g.coFacilitator?.memberId === memberId && !g.subFacilitators.some((s) => s.role === "CoFacilitator")))
}
