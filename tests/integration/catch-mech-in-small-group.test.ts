import { describe, it, expect, beforeEach, afterAll } from "vitest"

import { db } from "@/lib/db"
import { SLUG_CONFIG } from "@/app/(event)/event/[id]/catch-mech/status-slug"

/**
 * "Already part of a Small Group" (DeclineReason.AlreadyInSmallGroup) is split out of
 * the Rejected bucket into its own list — catch mech only tries to match registrants
 * who aren't already in a small group.
 *
 * The regression this pins: `{ declineReason: { not: "AlreadyInSmallGroup" } }` emits a
 * bare `"declineReason" <> $1`, and `NULL <> 'x'` is UNKNOWN in SQL — so every row with
 * a null reason is silently dropped. That is not a corner case: the small-group leader
 * path (app/small-group-confirmation/[token]/actions.ts) never writes declineReason, so
 * ALL leader-side rejections are null. Getting this wrong erases them from the Rejected
 * list — a worse bug than the one the split fixes.
 */

async function seed() {
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

/** Creates a guest + registrant + a Rejected request with the given decline reason. */
async function seedRejection(
  eventId: string,
  smallGroupId: string,
  breakoutGroupId: string,
  firstName: string,
  declineReason: "AlreadyInSmallGroup" | "NotInterested" | null
) {
  const guest = await db.guest.create({ data: { firstName, lastName: "G", language: [] } })
  const reg = await db.eventRegistrant.create({ data: { eventId, guestId: guest.id } })
  await db.breakoutGroupMember.create({ data: { breakoutGroupId, registrantId: reg.id } })
  await db.smallGroupMemberRequest.create({
    data: {
      smallGroupId, guestId: guest.id, breakoutGroupId,
      status: "Rejected", resolvedAt: new Date(), declineReason,
    },
  })
  return { guest, reg }
}

/** Mirrors the where-clause the [status] route builds for a given slug. */
function whereForSlug(slug: "rejected" | "in-small-group", breakoutGroupIds: string[]) {
  const { prismaStatus, declineReasonWhere } = SLUG_CONFIG[slug]
  return { status: prismaStatus, breakoutGroupId: { in: breakoutGroupIds }, ...declineReasonWhere }
}

describe("catch-mech in-small-group split", () => {
  beforeEach(async () => {
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

  it("keeps null-reason (leader-path) rejections in the Rejected list", async () => {
    const { event, sg, breakout } = await seed()
    await seedRejection(event.id, sg.id, breakout.id, "NullReason", null)
    await seedRejection(event.id, sg.id, breakout.id, "InGroup", "AlreadyInSmallGroup")

    const rejected = await db.smallGroupMemberRequest.findMany({
      where: whereForSlug("rejected", [breakout.id]),
      select: { guest: { select: { firstName: true } } },
    })

    // The regression: a `not` filter would return [] here instead of the null row.
    expect(rejected.map((r) => r.guest?.firstName)).toEqual(["NullReason"])
  })

  it("returns only AlreadyInSmallGroup rows for the in-small-group list", async () => {
    const { event, sg, breakout } = await seed()
    await seedRejection(event.id, sg.id, breakout.id, "NullReason", null)
    await seedRejection(event.id, sg.id, breakout.id, "NotInt", "NotInterested")
    await seedRejection(event.id, sg.id, breakout.id, "InGroup", "AlreadyInSmallGroup")

    const inGroup = await db.smallGroupMemberRequest.findMany({
      where: whereForSlug("in-small-group", [breakout.id]),
      select: { guest: { select: { firstName: true } } },
    })

    expect(inGroup.map((r) => r.guest?.firstName)).toEqual(["InGroup"])
  })

  it("partitions every Rejected row across exactly the two slugs", async () => {
    const { event, sg, breakout } = await seed()
    await seedRejection(event.id, sg.id, breakout.id, "A", null)
    await seedRejection(event.id, sg.id, breakout.id, "B", "NotInterested")
    await seedRejection(event.id, sg.id, breakout.id, "C", "AlreadyInSmallGroup")
    await seedRejection(event.id, sg.id, breakout.id, "D", "AlreadyInSmallGroup")

    const [rejected, inGroup, allRejected] = await Promise.all([
      db.smallGroupMemberRequest.count({ where: whereForSlug("rejected", [breakout.id]) }),
      db.smallGroupMemberRequest.count({ where: whereForSlug("in-small-group", [breakout.id]) }),
      db.smallGroupMemberRequest.count({
        where: { status: "Rejected", breakoutGroupId: { in: [breakout.id] } },
      }),
    ])

    expect(inGroup).toBe(2)
    expect(rejected).toBe(2)
    // No row is lost or double-counted by the split.
    expect(rejected + inGroup).toBe(allRejected)
  })
})
