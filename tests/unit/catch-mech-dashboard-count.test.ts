import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }))

import { db } from "@/lib/db"
import { submitCatchMechConfirmations } from "@/app/events/[id]/catch-mech/actions"
import {
  buildCatchMechGroupRows,
  type AggBreakoutGroup,
  type AggRequest,
} from "@/app/(event)/event/[id]/catch-mech/aggregate"

/**
 * Regression guard for the Catch Mech dashboard count bug.
 *
 * A confirmation sets the member's `smallGroupId`. The dashboard aggregation used
 * to skip any breakout member already in a small group BEFORE matching them to a
 * request, so confirmed people were filtered out and the "Confirmed" stat stayed 0.
 * Confirmed people must still be counted.
 */

describe("catch-mech dashboard count — pure aggregation", () => {
  it("counts a confirmed member even though they now have a smallGroupId", () => {
    const breakoutGroups: AggBreakoutGroup[] = [
      {
        id: "bg1",
        name: "Table 1",
        facilitator: {
          member: { id: "lead", firstName: "Lead", lastName: "Er", ledGroups: [{ id: "sg1", name: "G" }] },
        },
        members: [
          {
            registrant: {
              id: "r1",
              memberId: "m1",
              guestId: null,
              // Confirmed → now placed in sg1
              member: { firstName: "Cara", lastName: "Confirmed", smallGroupId: "sg1" },
              guest: null,
            },
          },
        ],
      },
    ]
    const allRequests: AggRequest[] = [
      { id: "req1", breakoutGroupId: "bg1", memberId: "m1", guestId: null, status: "Confirmed", declineReason: null },
    ]

    const { stats, groupRows } = buildCatchMechGroupRows(breakoutGroups, allRequests)

    expect(stats.totalConfirmed).toBe(1)
    expect(groupRows[0].confirmedCount).toBe(1)
    expect(groupRows[0].members[0]).toMatchObject({ name: "Cara Confirmed", status: "Confirmed" })
  })

  it("still excludes pre-placed members that have no catch-mech request", () => {
    const breakoutGroups: AggBreakoutGroup[] = [
      {
        id: "bg1",
        name: "Table 1",
        facilitator: { member: { id: "lead", firstName: "L", lastName: "E", ledGroups: [{ id: "sg1", name: "G" }] } },
        members: [
          {
            registrant: {
              id: "r2",
              memberId: "m2",
              guestId: null,
              member: { firstName: "Pre", lastName: "Placed", smallGroupId: "sgX" },
              guest: null,
            },
          },
        ],
      },
    ]
    // No request for m2 → treated as pre-assigned outside catch mech
    const { stats } = buildCatchMechGroupRows(breakoutGroups, [])
    expect(stats.totalCohort).toBe(0)
    // Pre-placed with no request is NOT the same as an AlreadyInSmallGroup decline —
    // it belongs to no bucket at all.
    expect(stats.totalInSmallGroup).toBe(0)
  })
})

/** Helper: one breakout group with N members, ids m1..mN. */
function groupWith(count: number): AggBreakoutGroup[] {
  return [
    {
      id: "bg1",
      name: "Table 1",
      facilitator: {
        member: { id: "lead", firstName: "L", lastName: "E", ledGroups: [{ id: "sg1", name: "G" }] },
      },
      members: Array.from({ length: count }, (_, i) => ({
        registrant: {
          id: `r${i + 1}`,
          memberId: `m${i + 1}`,
          guestId: null,
          member: { firstName: "P", lastName: `${i + 1}`, smallGroupId: null },
          guest: null,
        },
      })),
    },
  ]
}

const req = (
  n: number,
  status: AggRequest["status"],
  declineReason: AggRequest["declineReason"] = null
): AggRequest => ({
  id: `req${n}`,
  breakoutGroupId: "bg1",
  memberId: `m${n}`,
  guestId: null,
  status,
  declineReason,
})

describe("catch-mech AlreadyInSmallGroup bucket split", () => {
  it("separates AlreadyInSmallGroup from true rejections", () => {
    const { stats, groupRows } = buildCatchMechGroupRows(groupWith(4), [
      req(1, "Confirmed"),
      req(2, "Rejected", "NotInterested"),
      req(3, "Rejected", "AlreadyInSmallGroup"),
      req(4, "Rejected", "Unresponsive"),
    ])

    expect(stats.totalConfirmed).toBe(1)
    expect(stats.totalRejected).toBe(2)       // NOT 3 — the in-group one is excluded
    expect(stats.totalInSmallGroup).toBe(1)
    expect(stats.totalPending).toBe(0)

    expect(groupRows[0].rejectedCount).toBe(2)
    expect(groupRows[0].inSmallGroupCount).toBe(1)
    expect(groupRows[0].members.find((m) => m.name === "P 3")?.status).toBe("InSmallGroup")
  })

  it("treats a null declineReason as a true rejection, not in-small-group", () => {
    // The small-group leader path never writes declineReason, so every leader-side
    // rejection arrives null. Those must stay in the Rejected bucket.
    const { stats } = buildCatchMechGroupRows(groupWith(2), [
      req(1, "Rejected", null),
      req(2, "Rejected", "AlreadyInSmallGroup"),
    ])

    expect(stats.totalRejected).toBe(1)
    expect(stats.totalInSmallGroup).toBe(1)
  })

  it("computes matchable as cohort minus in-small-group, and buckets reconcile", () => {
    const { stats, groupRows } = buildCatchMechGroupRows(groupWith(10), [
      req(1, "Confirmed"),
      req(2, "Confirmed"),
      req(3, "Confirmed"),
      req(4, "Rejected", "NotInterested"),
      req(5, "Rejected", "AlreadyInSmallGroup"),
      req(6, "Rejected", "AlreadyInSmallGroup"),
      // 7..10 have no request → Pending
    ])

    expect(stats.totalCohort).toBe(10)
    expect(stats.totalInSmallGroup).toBe(2)
    expect(stats.matchable).toBe(8)
    expect(stats.totalConfirmed + stats.totalRejected + stats.totalPending).toBe(stats.matchable)

    // Per-group To Match excludes the in-group bucket and reconciles the same way.
    const row = groupRows[0]
    expect(row.toMatchCount).toBe(8)
    expect(row.confirmedCount + row.rejectedCount + row.pendingCount).toBe(row.toMatchCount)
    // ...but the sheet still lists everyone, in-group people included.
    expect(row.members).toHaveLength(10)
  })

  it("handles an all-in-small-group cohort without dividing by zero", () => {
    const { stats } = buildCatchMechGroupRows(groupWith(2), [
      req(1, "Rejected", "AlreadyInSmallGroup"),
      req(2, "Rejected", "AlreadyInSmallGroup"),
    ])

    expect(stats.totalCohort).toBe(2)
    expect(stats.matchable).toBe(0)
    expect(stats.totalInSmallGroup).toBe(2)
  })

  it("returns zeroed stats for an empty cohort", () => {
    const { stats } = buildCatchMechGroupRows([], [])
    expect(stats).toMatchObject({
      totalCohort: 0, matchable: 0, totalConfirmed: 0,
      totalRejected: 0, totalInSmallGroup: 0, totalPending: 0,
    })
  })
})

/** One breakout group holding a single guest registrant. */
function groupWithGuest(guest: {
  guestId: string
  memberId: string | null
  firstName?: string
  lastName?: string
}): AggBreakoutGroup[] {
  return [
    {
      id: "bg1",
      name: "Table 1",
      facilitator: {
        member: { id: "lead", firstName: "L", lastName: "E", ledGroups: [{ id: "sg1", name: "G" }] },
      },
      members: [
        {
          registrant: {
            id: `r-${guest.guestId}`,
            memberId: null,
            guestId: guest.guestId,
            member: null,
            guest: {
              firstName: guest.firstName ?? "Gee",
              lastName: guest.lastName ?? "Guest",
              memberId: guest.memberId,
            },
          },
        },
      ],
    },
  ]
}

describe("catch-mech promoted-guest exclusion (Pending count/list parity)", () => {
  it("excludes a guest promoted to Member outside catch mech (no request)", () => {
    // Guest.memberId is set (promoted elsewhere) and there's no catch-mech request →
    // not tracked, exactly as the list's pending derivation skips them.
    const { stats } = buildCatchMechGroupRows(
      groupWithGuest({ guestId: "g1", memberId: "m-promoted" }),
      []
    )
    expect(stats.totalCohort).toBe(0)
    expect(stats.totalPending).toBe(0)
  })

  it("still counts a guest that has an actual pending request", () => {
    const { stats } = buildCatchMechGroupRows(
      groupWithGuest({ guestId: "g2", memberId: null }),
      [] // no resolved request → derived Pending
    )
    expect(stats.totalPending).toBe(1)
  })

  it("REGRESSION: a confirmed guest still counts even though confirming set guest.memberId", () => {
    // Confirming a guest promotes them to a Member, which sets guest.memberId. Without
    // the `!req` guard the new skip would erase this person from the Confirmed count.
    const { stats } = buildCatchMechGroupRows(
      groupWithGuest({ guestId: "g3", memberId: "m-from-confirm" }),
      [{ id: "req1", breakoutGroupId: "bg1", memberId: null, guestId: "g3", status: "Confirmed", declineReason: null }]
    )
    expect(stats.totalConfirmed).toBe(1)
    expect(stats.totalPending).toBe(0)
  })
})

describe("catch-mech dashboard count — integration", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.$executeRaw`
      TRUNCATE
        "CatchMechSession", "BreakoutGroupMember", "BreakoutGroup",
        "Volunteer", "CommitteeRole", "VolunteerCommittee",
        "EventRegistrant", "Guest", "SmallGroupMemberRequest",
        "SmallGroupLog", "SmallGroup", "Member",
        "EventMinistry", "Event"
      RESTART IDENTITY CASCADE
    `
  })
  afterAll(async () => {
    await db.$disconnect()
  })

  it("a guest confirmed via the real action is counted Confirmed on the dashboard", async () => {
    const event = await db.event.create({
      data: { name: "E", type: "OneTime", startDate: new Date(), endDate: new Date() },
    })
    const leader = await db.member.create({
      data: { firstName: "Lead", lastName: "Er", dateJoined: new Date(), language: [] },
    })
    const sg = await db.smallGroup.create({
      data: { name: "Leader's Group", leaderId: leader.id, status: "Active" },
    })
    const committee = await db.volunteerCommittee.create({ data: { name: "Facis", eventId: event.id } })
    const role = await db.committeeRole.create({ data: { name: "Faci", committeeId: committee.id } })
    const volunteer = await db.volunteer.create({
      data: { memberId: leader.id, eventId: event.id, committeeId: committee.id, preferredRoleId: role.id, status: "Confirmed" },
    })
    const breakout = await db.breakoutGroup.create({
      data: { name: "Table 1", eventId: event.id, facilitatorId: volunteer.id, linkedSmallGroupId: sg.id },
    })
    const session = await db.catchMechSession.create({
      data: { eventId: event.id, breakoutGroupId: breakout.id, facilitatorVolunteerId: volunteer.id },
    })
    const guest = await db.guest.create({ data: { firstName: "Gina", lastName: "Guest", language: [] } })
    const reg = await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })
    await db.breakoutGroupMember.create({ data: { breakoutGroupId: breakout.id, registrantId: reg.id } })

    const result = await submitCatchMechConfirmations(session.token, [
      { registrantId: reg.id, status: "confirmed" },
    ])
    expect(result.success).toBe(true)

    // Re-fetch the exact data the dashboard page selects, then aggregate.
    const fresh = await db.event.findUnique({
      where: { id: event.id },
      select: {
        breakoutGroups: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            facilitator: {
              select: {
                member: {
                  select: {
                    id: true, firstName: true, lastName: true,
                    ledGroups: { select: { id: true, name: true }, orderBy: { name: "asc" } },
                  },
                },
              },
            },
            members: {
              select: {
                registrant: {
                  select: {
                    id: true, memberId: true, guestId: true,
                    member: { select: { firstName: true, lastName: true, smallGroupId: true } },
                    guest: { select: { firstName: true, lastName: true, memberId: true } },
                  },
                },
              },
            },
          },
        },
      },
    })
    const allRequests = await db.smallGroupMemberRequest.findMany({
      where: { breakoutGroupId: { in: fresh!.breakoutGroups.map((b) => b.id) } },
      select: {
        id: true, breakoutGroupId: true, memberId: true,
        guestId: true, status: true, declineReason: true,
      },
    })

    const { stats } = buildCatchMechGroupRows(fresh!.breakoutGroups, allRequests)
    expect(stats.totalConfirmed).toBe(1)
    expect(stats.totalPending).toBe(0)
  })
})
