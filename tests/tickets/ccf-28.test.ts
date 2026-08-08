import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}))

import { tryCreateSmallGroupRequestFromBreakout } from "@/lib/create-small-group-request"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "Event", "EventModule", "BreakoutGroup", "BreakoutGroupMember", "SmallGroup", "SmallGroupMemberRequest", "SmallGroupLog", "Member", "Guest", "EventRegistrant" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedBase() {
  const leader = await db.member.create({
    data: { firstName: "Leader", lastName: "L", dateJoined: new Date(), language: [] },
  })
  const targetGroup = await db.smallGroup.create({
    data: { name: "Target Group", leaderId: leader.id },
  })
  const event = await db.event.create({
    data: {
      name: "Test Event",
      type: "OneTime",
      startDate: new Date("2026-05-10"),
      endDate: new Date("2026-05-10"),
    },
  })
  const breakout = await db.breakoutGroup.create({
    data: { name: "Breakout A", eventId: event.id, linkedSmallGroupId: targetGroup.id },
  })
  return { leader, targetGroup, event, breakout }
}

describe("CCF-28 – exclude existing small group members from catch mech", () => {
  describe("integration: tryCreateSmallGroupRequestFromBreakout", () => {
    it("does NOT create a request for a member already in any small group", async () => {
      const { targetGroup, event, breakout } = await seedBase()

      const otherLeader = await db.member.create({
        data: { firstName: "Other", lastName: "Leader", dateJoined: new Date(), language: [] },
      })
      const otherGroup = await db.smallGroup.create({
        data: { name: "Other Group", leaderId: otherLeader.id },
      })
      const member = await db.member.create({
        data: {
          firstName: "Already", lastName: "InGroup", dateJoined: new Date(), language: [],
          smallGroupId: otherGroup.id, // already in a group (different from targetGroup)
        },
      })
      const registrant = await db.eventRegistrant.create({
        data: { eventId: event.id, memberId: member.id },
      })

      await tryCreateSmallGroupRequestFromBreakout(breakout.id, registrant.id)

      const request = await db.smallGroupMemberRequest.findFirst({
        where: { smallGroupId: targetGroup.id, memberId: member.id },
      })
      expect(request).toBeNull()
    })

    it("does NOT create a request for a member already in the target group itself", async () => {
      const { targetGroup, event, breakout } = await seedBase()

      const member = await db.member.create({
        data: {
          firstName: "Same", lastName: "Group", dateJoined: new Date(), language: [],
          smallGroupId: targetGroup.id, // already in the target group
        },
      })
      const registrant = await db.eventRegistrant.create({
        data: { eventId: event.id, memberId: member.id },
      })

      await tryCreateSmallGroupRequestFromBreakout(breakout.id, registrant.id)

      const request = await db.smallGroupMemberRequest.findFirst({
        where: { smallGroupId: targetGroup.id, memberId: member.id },
      })
      expect(request).toBeNull()
    })

    it("creates a request for a member not yet in any small group", async () => {
      const { targetGroup, event, breakout } = await seedBase()

      const member = await db.member.create({
        data: {
          firstName: "No", lastName: "Group", dateJoined: new Date(), language: [],
          // smallGroupId intentionally null
        },
      })
      const registrant = await db.eventRegistrant.create({
        data: { eventId: event.id, memberId: member.id },
      })

      await tryCreateSmallGroupRequestFromBreakout(breakout.id, registrant.id)

      const request = await db.smallGroupMemberRequest.findFirst({
        where: { smallGroupId: targetGroup.id, memberId: member.id },
      })
      expect(request).not.toBeNull()
      expect(request?.status).toBe("Pending")
    })

    it("creates a request for a guest (guests are never in a small group)", async () => {
      const { targetGroup, event, breakout } = await seedBase()

      const guest = await db.guest.create({
        data: { firstName: "Guest", lastName: "Person", language: [] },
      })
      const registrant = await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest.id },
      })

      await tryCreateSmallGroupRequestFromBreakout(breakout.id, registrant.id)

      const request = await db.smallGroupMemberRequest.findFirst({
        where: { smallGroupId: targetGroup.id, guestId: guest.id },
      })
      expect(request).not.toBeNull()
      expect(request?.status).toBe("Pending")
    })
  })

  describe("regression", () => {
    it("a member in a different group was previously treated as a valid catch mech target — now excluded", async () => {
      // Regression guard: the old code only skipped if member.smallGroupId === targetGroupId.
      // Members in ANY other group were still getting requests created. This must never happen again.
      const { targetGroup, event, breakout } = await seedBase()

      const differentLeader = await db.member.create({
        data: { firstName: "Diff", lastName: "Leader", dateJoined: new Date(), language: [] },
      })
      const differentGroup = await db.smallGroup.create({
        data: { name: "Different Group", leaderId: differentLeader.id },
      })
      const member = await db.member.create({
        data: {
          firstName: "Transfer", lastName: "Candidate", dateJoined: new Date(), language: [],
          smallGroupId: differentGroup.id,
        },
      })
      const registrant = await db.eventRegistrant.create({
        data: { eventId: event.id, memberId: member.id },
      })

      await tryCreateSmallGroupRequestFromBreakout(breakout.id, registrant.id)

      const requests = await db.smallGroupMemberRequest.findMany({
        where: { smallGroupId: targetGroup.id },
      })
      expect(requests).toHaveLength(0)
    })
  })
})
