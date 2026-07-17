import type { DeclineReason } from "@/app/generated/prisma/client"
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
  declineReason: DeclineReason | null
}

export type CatchMechStats = {
  /** Everyone tracked by catch mech: confirmed + rejected + inSmallGroup + pending. */
  totalCohort: number
  /** The people catch mech is actually trying to place: totalCohort − inSmallGroup. */
  matchable: number
  totalConfirmed: number
  /** True rejections only — excludes AlreadyInSmallGroup. */
  totalRejected: number
  totalInSmallGroup: number
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
  let totalInSmallGroup = 0
  let totalPending = 0

  for (const bg of breakoutGroups) {
    const faciMember = bg.facilitator?.member ?? null
    const isTimothy = faciMember ? faciMember.ledGroups.length === 0 : false
    const ledGroupNames = faciMember?.ledGroups.map((g) => g.name) ?? []

    const groupRequests = allRequests.filter((r) => r.breakoutGroupId === bg.id)

    let confirmed = 0
    let rejected = 0
    let inSmallGroup = 0
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
      //
      // This is deliberately NOT the same as the "In Small Group" bucket below, which
      // counts people a facilitator explicitly reported as AlreadyInSmallGroup. Someone
      // pre-placed outside catch mech was never part of the cohort and belongs in no
      // bucket at all; someone declined as AlreadyInSmallGroup was surfaced by the flow
      // and needs to be visible. Don't "unify" these — they're different populations.
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
      else if (req?.status === "Rejected") {
        // Both buckets are Prisma status Rejected — declineReason splits them.
        if (req.declineReason === "AlreadyInSmallGroup") { status = "InSmallGroup"; inSmallGroup++ }
        else { status = "Rejected"; rejected++ }
      }

      // requestId enables the admin undo action — only present for resolved decisions
      members.push({ name, status, requestId: req?.id ?? null })
    }

    const pending = members.length - confirmed - rejected - inSmallGroup
    // Per-group "To Match" excludes the in-group bucket, so each row reconciles as
    // Confirmed + Rejected + Pending = To Match.
    const toMatch = confirmed + rejected + pending

    totalConfirmed += confirmed
    totalRejected += rejected
    totalInSmallGroup += inSmallGroup
    totalPending += pending

    groupRows.push({
      id: bg.id,
      name: bg.name,
      faciName: faciMember ? `${faciMember.firstName} ${faciMember.lastName}` : null,
      faciMemberId: faciMember?.id ?? null,
      isTimothy,
      ledGroupNames,
      toMatchCount: toMatch,
      confirmedCount: confirmed,
      rejectedCount: rejected,
      inSmallGroupCount: inSmallGroup,
      pendingCount: pending,
      members,
    })
  }

  const totalCohort = totalConfirmed + totalRejected + totalInSmallGroup + totalPending

  return {
    groupRows,
    stats: {
      totalCohort,
      matchable: totalCohort - totalInSmallGroup,
      totalConfirmed,
      totalRejected,
      totalInSmallGroup,
      totalPending,
    },
  }
}
