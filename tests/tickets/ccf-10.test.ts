import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"

/**
 * CCF-10: Period-filterable stat cards on the dashboard.
 *
 * Tests verify:
 *  - Period start date computation (unit)
 *  - DB queries respect the period boundary (integration)
 *  - Out-of-period data is excluded (regression)
 */

// Replicated from dashboard/page.tsx
function getPeriodStart(period: string): Date {
  const now = new Date()
  switch (period) {
    case "week":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case "quarter":
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    case "year":
      return new Date(now.getFullYear(), 0, 1)
    default: // month
      return new Date(now.getFullYear(), now.getMonth(), 1)
  }
}

const VALID_PERIODS = ["week", "month", "quarter", "year"]

describe("CCF-10 – Period-filterable dashboard stats", () => {
  describe("unit – period start date computation", () => {
    it("week returns a date ~7 days in the past", () => {
      const now = new Date()
      const start = getPeriodStart("week")
      const diffMs = now.getTime() - start.getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      expect(diffDays).toBeCloseTo(7, 0)
    })

    it("month returns the first day of the current month", () => {
      const start = getPeriodStart("month")
      const now = new Date()
      expect(start.getFullYear()).toBe(now.getFullYear())
      expect(start.getMonth()).toBe(now.getMonth())
      expect(start.getDate()).toBe(1)
    })

    it("quarter returns a date ~90 days in the past", () => {
      const now = new Date()
      const start = getPeriodStart("quarter")
      const diffMs = now.getTime() - start.getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      expect(diffDays).toBeCloseTo(90, 0)
    })

    it("year returns January 1st of the current year", () => {
      const start = getPeriodStart("year")
      const now = new Date()
      expect(start.getFullYear()).toBe(now.getFullYear())
      expect(start.getMonth()).toBe(0)
      expect(start.getDate()).toBe(1)
    })

    it("unknown period falls back to month behaviour", () => {
      const start = getPeriodStart("invalid")
      const now = new Date()
      expect(start.getFullYear()).toBe(now.getFullYear())
      expect(start.getMonth()).toBe(now.getMonth())
      expect(start.getDate()).toBe(1)
    })

    it("all valid period keys produce a start date in the past", () => {
      const now = new Date()
      for (const p of VALID_PERIODS) {
        expect(getPeriodStart(p).getTime()).toBeLessThan(now.getTime())
      }
    })
  })

  describe("integration – guest registrations in period", () => {
    beforeEach(async () => {
      await db.$executeRaw`TRUNCATE "EventRegistrant", "Event", "Guest", "Member", "SmallGroup" RESTART IDENTITY CASCADE`
    })
    afterAll(async () => {
      await db.$disconnect()
    })

    it("counts only guest registrants created within the period", async () => {
      const leader = await db.member.create({
        data: { firstName: "Leader", lastName: "Test", dateJoined: new Date(), language: [] },
      })
      const group = await db.smallGroup.create({
        data: { name: "Test Group", leaderId: leader.id },
      })
      await db.member.update({
        where: { id: leader.id },
        data: { smallGroupId: group.id },
      })

      const event = await db.event.create({
        data: {
          name: "Test Event",
          type: "OneTime",
          startDate: new Date(),
          endDate: new Date(),
        },
      })
      const guest1 = await db.guest.create({
        data: { firstName: "Alice", lastName: "In", language: [] },
      })
      const guest2 = await db.guest.create({
        data: { firstName: "Bob", lastName: "In", language: [] },
      })
      const guestOld = await db.guest.create({
        data: { firstName: "Charlie", lastName: "Out", language: [] },
      })

      const periodStart = getPeriodStart("month")
      const beforePeriod = new Date(periodStart.getTime() - 1000)

      await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest1.id },
      })
      await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest2.id },
      })
      // This one is outside the period — manually set createdAt via raw SQL
      const old = await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guestOld.id },
      })
      await db.$executeRaw`UPDATE "EventRegistrant" SET "createdAt" = ${beforePeriod} WHERE id = ${old.id}`

      const count = await db.eventRegistrant.count({
        where: { guestId: { not: null }, createdAt: { gte: periodStart } },
      })
      expect(count).toBe(2)
    })
  })

  describe("integration – new leaders in period", () => {
    beforeEach(async () => {
      await db.$executeRaw`TRUNCATE "SmallGroup", "Member" RESTART IDENTITY CASCADE`
    })

    it("counts only members who joined AND became leaders within the period", async () => {
      const periodStart = getPeriodStart("month")
      const beforePeriod = new Date(periodStart.getTime() - 1)

      // Leader who joined this month
      const newLeader = await db.member.create({
        data: { firstName: "New", lastName: "Leader", dateJoined: new Date(), language: [] },
      })
      await db.smallGroup.create({
        data: { name: "New Group", leaderId: newLeader.id },
      })

      // Leader who joined before the period
      const oldLeader = await db.member.create({
        data: { firstName: "Old", lastName: "Leader", dateJoined: beforePeriod, language: [] },
      })
      await db.smallGroup.create({
        data: { name: "Old Group", leaderId: oldLeader.id },
      })

      // Non-leader member who joined this month
      await db.member.create({
        data: { firstName: "Regular", lastName: "Member", dateJoined: new Date(), language: [] },
      })

      const count = await db.member.count({
        where: {
          dateJoined: { gte: periodStart },
          ledGroups: { some: {} },
        },
      })
      expect(count).toBe(1)
    })
  })

  describe("regression – data outside the period is not counted", () => {
    beforeEach(async () => {
      await db.$executeRaw`TRUNCATE "EventRegistrant", "Event", "Guest", "Member", "SmallGroup" RESTART IDENTITY CASCADE`
    })

    it("returns zero when all registrations predate the period", async () => {
      const leader = await db.member.create({
        data: { firstName: "L", lastName: "L", dateJoined: new Date(), language: [] },
      })
      const group = await db.smallGroup.create({
        data: { name: "G", leaderId: leader.id },
      })
      await db.member.update({
        where: { id: leader.id },
        data: { smallGroupId: group.id },
      })
      const event = await db.event.create({
        data: {
          name: "Old Event",
          type: "OneTime",
          startDate: new Date(),
          endDate: new Date(),
        },
      })
      const guest = await db.guest.create({
        data: { firstName: "Old", lastName: "Guest", language: [] },
      })
      const reg = await db.eventRegistrant.create({
        data: { eventId: event.id, guestId: guest.id },
      })

      const oneYearAgo = new Date()
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
      await db.$executeRaw`UPDATE "EventRegistrant" SET "createdAt" = ${oneYearAgo} WHERE id = ${reg.id}`

      const periodStart = getPeriodStart("month")
      const count = await db.eventRegistrant.count({
        where: { guestId: { not: null }, createdAt: { gte: periodStart } },
      })
      expect(count).toBe(0)
    })
  })
})
