import { describe, it, expect, beforeEach, afterAll } from "vitest"

import { db } from "@/lib/db"
import { tryCreateSmallGroupRequestFromBreakout } from "@/lib/create-small-group-request"

/**
 * The top-level Small Groups → Requests tab lists pending SmallGroupMemberRequest rows
 * with `where: { status: Pending, smallGroupId: { not: null }, breakoutGroupId: null }`
 * (app/(dashboard)/small-groups/page.tsx — getPendingRequests + the tab count).
 *
 * Regression pinned here: breakout/catch-mech placements are ordinary pending requests
 * that carry a `breakoutGroupId`. Before the filter was added they leaked into the
 * top-level tab, which was confusing — those placements belong to the event workspace
 * and the group's own temp-member count, not the church-wide requests queue. This test
 * pins the invariant the filter depends on: breakout-origin requests set breakoutGroupId,
 * admin/manual requests leave it null, and the tab's where-clause keeps only the latter.
 */

// The exact filter the requests tab and its count badge use.
const TAB_FILTER = {
  status: "Pending" as const,
  smallGroupId: { not: null },
  breakoutGroupId: null,
}

async function seedGroupAndBreakout() {
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
    data: {
      memberId: leader.id, eventId: event.id, committeeId: committee.id,
      preferredRoleId: role.id, status: "Confirmed",
    },
  })
  const breakout = await db.breakoutGroup.create({
    data: { name: "Table 1", eventId: event.id, facilitatorId: volunteer.id, linkedSmallGroupId: sg.id },
  })
  return { event, sg, breakout }
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "SmallGroupMemberRequest", "SmallGroupLog", "BreakoutGroupMember", "BreakoutGroup", "EventRegistrant", "Volunteer", "CommitteeRole", "VolunteerCommittee", "SmallGroup", "Member", "Guest", "Event" RESTART IDENTITY CASCADE`
})
afterAll(async () => {
  await db.$disconnect()
})

describe("Small Groups requests tab excludes breakout/catch-mech placements", () => {
  it("breakout placement creates a pending request carrying breakoutGroupId", async () => {
    const { event, breakout } = await seedGroupAndBreakout()
    const guest = await db.guest.create({ data: { firstName: "Bree", lastName: "K", language: [] } })
    const reg = await db.eventRegistrant.create({ data: { eventId: event.id, guestId: guest.id } })

    await tryCreateSmallGroupRequestFromBreakout(breakout.id, reg.id)

    const req = await db.smallGroupMemberRequest.findFirst({ where: { guestId: guest.id } })
    expect(req).not.toBeNull()
    expect(req?.status).toBe("Pending")
    expect(req?.breakoutGroupId).toBe(breakout.id)
  })

  it("the tab filter keeps admin/manual requests and drops breakout-origin ones", async () => {
    const { event, sg, breakout } = await seedGroupAndBreakout()

    // Breakout-origin request (catch-mech / breakout placement): has breakoutGroupId.
    const breakoutGuest = await db.guest.create({ data: { firstName: "Bree", lastName: "K", language: [] } })
    const breakoutReg = await db.eventRegistrant.create({ data: { eventId: event.id, guestId: breakoutGuest.id } })
    await tryCreateSmallGroupRequestFromBreakout(breakout.id, breakoutReg.id)

    // Admin/manual temp assignment: no breakoutGroupId.
    const manualGuest = await db.guest.create({ data: { firstName: "Manu", lastName: "Al", language: [] } })
    await db.smallGroupMemberRequest.create({
      data: { smallGroupId: sg.id, guestId: manualGuest.id, status: "Pending" },
    })

    const visible = await db.smallGroupMemberRequest.findMany({ where: TAB_FILTER })
    expect(visible).toHaveLength(1)
    expect(visible[0].guestId).toBe(manualGuest.id)
    expect(visible[0].breakoutGroupId).toBeNull()

    // The count badge uses the same filter.
    const count = await db.smallGroupMemberRequest.count({ where: TAB_FILTER })
    expect(count).toBe(1)
  })
})
