import type { GroupRow } from "./catch-mech-table"

// Minimal shapes of the data the dashboard aggregation needs. These mirror the
// `select`ed fields in `getCatchMechData` (page.tsx) but stay decoupled from Prisma
// so the logic can be unit-tested with plain objects.

export type AggBreakoutGroup = {
  id: string
  name: string
  facilitator: {
    member: {
      id: string
      firstName: string
      lastName: string
      ledGroups: { id: string; name: string }[]
    } | null
  } | null
  members: {
    registrant: {
      id: string
      memberId: string | null
      guestId: string | null
      member: { firstName: string; lastName: string; smallGroupId: string | null } | null
      guest: { firstName: string; lastName: string } | null
    }
  }[]
}

export type AggRequest = {
  id: string
  breakoutGroupId: string | null
  memberId: string | null
  guestId: string | null
  status: "Confirmed" | "Rejected" | "Pending"
}

export type CatchMechStats = {
  totalMembers: number
  totalConfirmed: number
  totalRejected: number
  totalPending: number
}

/**
 * Build the per-breakout-group rows and aggregate stats shown on the Catch Mech
 * dashboard. Pure (no DB) so it can be unit-tested directly.
 *
 * Important: a confirmation sets the member's `smallGroupId`, so a breakout member
 * must be matched to their request BEFORE the "already placed" exclusion — otherwise
 * confirmed people get filtered out and never counted (the CCF dashboard regression).
 */
export function buildCatchMechGroupRows(
  breakoutGroups: AggBreakoutGroup[],
  allRequests: AggRequest[]
): { groupRows: GroupRow[]; stats: CatchMechStats } {
  const groupRows: GroupRow[] = []
  let totalConfirmed = 0
  let totalRejected = 0
  let totalPending = 0

  for (const bg of breakoutGroups) {
    const faciMember = bg.facilitator?.member ?? null
    const isTimothy = faciMember ? faciMember.ledGroups.length === 0 : false
    const ledGroupNames = faciMember?.ledGroups.map((g) => g.name) ?? []

    const groupRequests = allRequests.filter((r) => r.breakoutGroupId === bg.id)

    let confirmed = 0
    let rejected = 0
    const members: GroupRow["members"] = []

    for (const m of bg.members) {
      const r = m.registrant
      if (!r.memberId && !r.guestId) continue

      // Match to a request record first — a confirmation sets the member's
      // smallGroupId, so we must count it before applying the placement skip below.
      const req = groupRequests.find(
        (rq) =>
          (r.memberId && rq.memberId === r.memberId) ||
          (r.guestId && rq.guestId === r.guestId)
      )

      // Members already placed in a small group with NO catch-mech request were
      // pre-assigned outside this flow — exclude them from tracking.
      if (!req && r.memberId && r.member?.smallGroupId) continue

      // Resolve display name
      let name = "Unknown"
      if (r.memberId && r.member) {
        name = `${r.member.firstName} ${r.member.lastName}`
      } else if (r.guestId && r.guest) {
        name = `${r.guest.firstName} ${r.guest.lastName}`
      }

      let status: GroupRow["members"][number]["status"] = "Pending"
      if (req?.status === "Confirmed") { status = "Confirmed"; confirmed++ }
      else if (req?.status === "Rejected") { status = "Rejected"; rejected++ }

      // requestId enables the admin undo action — only present for resolved decisions
      members.push({ name, status, requestId: req?.id ?? null })
    }

    const total = members.length
    const pending = total - confirmed - rejected

    totalConfirmed += confirmed
    totalRejected += rejected
    totalPending += pending

    groupRows.push({
      id: bg.id,
      name: bg.name,
      faciName: faciMember ? `${faciMember.firstName} ${faciMember.lastName}` : null,
      faciMemberId: faciMember?.id ?? null,
      isTimothy,
      ledGroupNames,
      totalMembers: total,
      confirmedCount: confirmed,
      rejectedCount: rejected,
      pendingCount: pending,
      members,
    })
  }

  return {
    groupRows,
    stats: {
      totalMembers: totalConfirmed + totalRejected + totalPending,
      totalConfirmed,
      totalRejected,
      totalPending,
    },
  }
}
