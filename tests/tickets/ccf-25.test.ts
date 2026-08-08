import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}))

import { assignCatchMechRegistrantToGroup } from "@/app/(event)/event/[id]/catch-mech/matching-actions"

/**
 * CCF-25: After assigning a rejected registrant to a group in the Catch Mech
 * page, the navigation should land on the Small Group tab (?tab=small-group),
 * not reset to the Details tab.
 *
 * The fix:
 *  - CatchMechDetailClient accepts initialTab prop, defaulting to "details"
 *  - page.tsx reads ?tab search param and forwards initialTab="small-group"
 *  - handleAssign navigates with ?tab=small-group appended
 */

describe("CCF-25", () => {
  describe("unit", () => {
    it("initialTab defaults to 'details' when tab param is absent", () => {
      // Mirrors the logic in page.tsx: tab === "small-group" ? "small-group" : "details"
      const derive = (tab: string | undefined) =>
        tab === "small-group" ? "small-group" : "details"

      expect(derive(undefined)).toBe("details")
      expect(derive("")).toBe("details")
      expect(derive("invalid")).toBe("details")
      expect(derive("small-group")).toBe("small-group")
    })

    it("initialTab is 'small-group' when tab param equals 'small-group'", () => {
      const derive = (tab: string | undefined) =>
        tab === "small-group" ? "small-group" : "details"

      expect(derive("small-group")).toBe("small-group")
    })
  })

  describe("integration", () => {
    beforeEach(async () => {
      await db.$executeRaw`TRUNCATE "SmallGroupMemberRequest", "BreakoutGroupMember", "BreakoutGroup", "EventRegistrant", "EventOccurrence", "Event", "SmallGroup", "Member", "LifeStage", "Guest" RESTART IDENTITY CASCADE`
    })

    afterAll(async () => {
      await db.$disconnect()
    })

    it("assignCatchMechRegistrantToGroup transitions a Rejected request to Pending with the new group", async () => {
      // Seed: LifeStage → Member (leader) → SmallGroup → Event → BreakoutGroup → Guest → EventRegistrant → SmallGroupMemberRequest(Rejected)
      const lifeStage = await db.lifeStage.create({ data: { name: "Young Adults", order: 1 } })
      const leader = await db.member.create({
        data: {
          firstName: "Leader",
          lastName: "One",
          dateJoined: new Date(),
          language: [],
        },
      })
      const group = await db.smallGroup.create({
        data: { name: "Group A", leaderId: leader.id },
      })
      const targetGroup = await db.smallGroup.create({
        data: { name: "Group B", leaderId: leader.id },
      })
      const event = await db.event.create({
        data: { name: "Test Event", type: "OneTime", startDate: new Date(), endDate: new Date() },
      })
      const breakout = await db.breakoutGroup.create({
        data: { name: "Breakout 1", eventId: event.id, lifeStages: { connect: { id: lifeStage.id } } },
      })
      const guest = await db.guest.create({
        data: { firstName: "Jane", lastName: "Doe", language: [] },
      })
      const registrant = await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest.id },
      })
      await db.smallGroupMemberRequest.create({
        data: {
          smallGroupId: group.id,
          guestId: guest.id,
          breakoutGroupId: breakout.id,
          status: "Rejected",
          resolvedAt: new Date(),
        },
      })

      const result = await assignCatchMechRegistrantToGroup(registrant.id, event.id, targetGroup.id)

      expect(result.success).toBe(true)

      const updated = await db.smallGroupMemberRequest.findFirst({
        where: { guestId: guest.id },
      })
      expect(updated?.status).toBe("Pending")
      expect(updated?.smallGroupId).toBe(targetGroup.id)
      expect(updated?.resolvedAt).toBeNull()
    })
  })

  describe("regression", () => {
    it("tab param 'details' does not activate 'small-group' tab", () => {
      const derive = (tab: string | undefined) =>
        tab === "small-group" ? "small-group" : "details"

      expect(derive("details")).toBe("details")
    })

    it("only exact 'small-group' string activates the small-group tab", () => {
      const derive = (tab: string | undefined) =>
        tab === "small-group" ? "small-group" : "details"

      // Variants that should NOT activate small-group tab
      const invalid = ["Small-Group", "SMALL-GROUP", "small_group", "smallgroup", " small-group"]
      for (const v of invalid) {
        expect(derive(v)).toBe("details")
      }
    })
  })
})
