import { db } from "@/lib/db"
import type { Prisma } from "@/app/generated/prisma/client"
import { loadCatchMechAttendance } from "./attendance-server"

import { CATCH_MECH_ELIGIBILITY_ERROR } from "./eligibility-copy"
export class CatchMechEligibilityError extends Error {
  constructor() { super(CATCH_MECH_ELIGIBILITY_ERROR) }
}

/** The same event-wide cohort powers forms, search, empty states and transactional guards. */
export async function eligibleCatchMechRegistrantIds(eventId: string, client: Prisma.TransactionClient = db): Promise<Set<string>> {
  const [attendance, registrants] = await Promise.all([
    loadCatchMechAttendance(eventId, client),
    client.eventRegistrant.findMany({
      where: { eventId },
      select: {
        id: true,
        member: { select: {
          smallGroupId: true, upwardSatellite: true,
          groupRequests: { where: { status: "Pending", smallGroupId: { not: null } }, select: { id: true }, take: 1 },
        } },
        guest: { select: {
          memberId: true, claimedSmallGroupId: true, claimedSatellite: true,
          groupRequests: { where: { status: "Pending", smallGroupId: { not: null } }, select: { id: true }, take: 1 },
        } },
      },
    }),
  ])
  return new Set(registrants.filter((row) => {
    const visits = attendance.get(row.id)
    if (!visits || visits.sessionsAttended < (visits.oneTime ? 1 : 2)) return false
    if (row.member) return !row.member.smallGroupId && !row.member.upwardSatellite && row.member.groupRequests.length === 0
    if (row.guest) return !row.guest.memberId && !row.guest.claimedSmallGroupId && !row.guest.claimedSatellite && row.guest.groupRequests.length === 0
    return false
  }).map((row) => row.id))
}

export async function assertCatchMechEligibility(eventId: string, ids: string[], client: Prisma.TransactionClient = db) {
  if (!ids.length) return
  const eligible = await eligibleCatchMechRegistrantIds(eventId, client)
  if (ids.some((id) => !eligible.has(id))) throw new CatchMechEligibilityError()
}
