import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"

afterAll(async () => {
  await db.$disconnect()
})

describe("CCF-9 – SG Leader count and percentage on dashboard", () => {
  describe("unit – leader percentage calculation", () => {
    const calcPercentage = (totalLeaders: number, totalMembers: number) =>
      totalMembers > 0 ? Math.round((totalLeaders / totalMembers) * 100) : 0

    it("returns the correct percentage", () => {
      expect(calcPercentage(25, 100)).toBe(25)
    })

    it("rounds to nearest integer", () => {
      expect(calcPercentage(1, 3)).toBe(33)
    })

    it("returns 0 when there are no members (avoids division by zero)", () => {
      expect(calcPercentage(0, 0)).toBe(0)
    })
  })

  describe("integration – leader DB query", () => {
    beforeEach(async () => {
      await db.$executeRaw`TRUNCATE "SmallGroup", "Member" RESTART IDENTITY CASCADE`
    })

    it("counts only members who lead at least one small group", async () => {
      const leader1 = await db.member.create({
        data: { firstName: "Alice", lastName: "Smith", dateJoined: new Date(), language: [] },
      })
      const leader2 = await db.member.create({
        data: { firstName: "Bob", lastName: "Jones", dateJoined: new Date(), language: [] },
      })
      await db.member.create({
        data: { firstName: "Charlie", lastName: "Brown", dateJoined: new Date(), language: [] },
      })

      await db.smallGroup.create({ data: { name: "Group A", leaderId: leader1.id } })
      await db.smallGroup.create({ data: { name: "Group B", leaderId: leader2.id } })

      const totalLeaders = await db.member.count({ where: { ledGroups: { some: {} } } })
      expect(totalLeaders).toBe(2)
    })

    it("counts a member only once even if they lead multiple groups", async () => {
      const leader = await db.member.create({
        data: { firstName: "Alice", lastName: "Smith", dateJoined: new Date(), language: [] },
      })

      await db.smallGroup.create({ data: { name: "Group A", leaderId: leader.id } })
      await db.smallGroup.create({ data: { name: "Group B", leaderId: leader.id } })

      const totalLeaders = await db.member.count({ where: { ledGroups: { some: {} } } })
      expect(totalLeaders).toBe(1)
    })

    it("returns 0 when no members lead any groups", async () => {
      await db.member.create({
        data: { firstName: "Alice", lastName: "Smith", dateJoined: new Date(), language: [] },
      })

      const totalLeaders = await db.member.count({ where: { ledGroups: { some: {} } } })
      expect(totalLeaders).toBe(0)
    })
  })

  describe("regression – totalLeaders never exceeds totalMembers", () => {
    beforeEach(async () => {
      await db.$executeRaw`TRUNCATE "SmallGroup", "Member" RESTART IDENTITY CASCADE`
    })

    it("leader count is always a subset of total member count", async () => {
      const member = await db.member.create({
        data: { firstName: "Alice", lastName: "Smith", dateJoined: new Date(), language: [] },
      })
      await db.smallGroup.create({ data: { name: "Group A", leaderId: member.id } })
      await db.member.create({
        data: { firstName: "Bob", lastName: "Jones", dateJoined: new Date(), language: [] },
      })

      const totalMembers = await db.member.count()
      const totalLeaders = await db.member.count({ where: { ledGroups: { some: {} } } })

      expect(totalLeaders).toBeLessThanOrEqual(totalMembers)
    })
  })
})
