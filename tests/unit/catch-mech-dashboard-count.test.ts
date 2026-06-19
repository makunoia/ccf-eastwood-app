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
      { id: "req1", breakoutGroupId: "bg1", memberId: "m1", guestId: null, status: "Confirmed" },
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
    expect(stats.totalMembers).toBe(0)
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
                    guest: { select: { firstName: true, lastName: true } },
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
      select: { id: true, breakoutGroupId: true, memberId: true, guestId: true, status: true },
    })

    const { stats } = buildCatchMechGroupRows(fresh!.breakoutGroups, allRequests)
    expect(stats.totalConfirmed).toBe(1)
    expect(stats.totalPending).toBe(0)
  })
})
