import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { importSmallGroups } from "@/app/(dashboard)/small-groups/import-actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "SmallGroup", "Member", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedLeader(email = "leader@test.com") {
  return db.member.create({
    data: { firstName: "Leader", lastName: "Test", email, dateJoined: new Date(), language: [] },
  })
}

describe("CCF-21 – Small Group import: Schedule and Time fields", () => {
  describe("integration: scheduleDayOfWeek is saved", () => {
    it("saves scheduleDayOfWeek when given a full day name", async () => {
      const leader = await seedLeader()

      const result = await importSmallGroups([{
        mapped: { name: "Group A", leaderEmail: leader.email!, scheduleDayOfWeek: "Monday" },
        resolution: "use-csv",
      }])

      expect(result.success).toBe(true)
      const group = await db.smallGroup.findFirst({ where: { name: "Group A" } })
      expect(group?.scheduleDayOfWeek).toBe(1)
    })

    it("saves scheduleDayOfWeek when given a numeric string", async () => {
      const leader = await seedLeader()

      const result = await importSmallGroups([{
        mapped: { name: "Group B", leaderEmail: leader.email!, scheduleDayOfWeek: "3" },
        resolution: "use-csv",
      }])

      expect(result.success).toBe(true)
      const group = await db.smallGroup.findFirst({ where: { name: "Group B" } })
      expect(group?.scheduleDayOfWeek).toBe(3)
    })

    it("saves 0 for Sunday (falsy value handled correctly)", async () => {
      const leader = await seedLeader()

      const result = await importSmallGroups([{
        mapped: { name: "Group C", leaderEmail: leader.email!, scheduleDayOfWeek: "Sunday" },
        resolution: "use-csv",
      }])

      expect(result.success).toBe(true)
      const group = await db.smallGroup.findFirst({ where: { name: "Group C" } })
      expect(group?.scheduleDayOfWeek).toBe(0)
    })

    it("saves 0 for numeric string '0' (Sunday)", async () => {
      const leader = await seedLeader()

      const result = await importSmallGroups([{
        mapped: { name: "Group D", leaderEmail: leader.email!, scheduleDayOfWeek: "0" },
        resolution: "use-csv",
      }])

      expect(result.success).toBe(true)
      const group = await db.smallGroup.findFirst({ where: { name: "Group D" } })
      expect(group?.scheduleDayOfWeek).toBe(0)
    })

    it("saves null when scheduleDayOfWeek is not provided", async () => {
      const leader = await seedLeader()

      await importSmallGroups([{
        mapped: { name: "Group E", leaderEmail: leader.email! },
        resolution: "use-csv",
      }])

      const group = await db.smallGroup.findFirst({ where: { name: "Group E" } })
      expect(group?.scheduleDayOfWeek).toBeNull()
    })
  })

  describe("integration: scheduleTimeStart is saved", () => {
    it("saves scheduleTimeStart when given HH:MM format", async () => {
      const leader = await seedLeader()

      await importSmallGroups([{
        mapped: { name: "Group F", leaderEmail: leader.email!, scheduleTime: "10:00" },
        resolution: "use-csv",
      }])

      const group = await db.smallGroup.findFirst({ where: { name: "Group F" } })
      expect(group?.scheduleTimeStart).toBe("10:00")
    })

    it("normalizes single-digit hour to two digits (9:00 → 09:00)", async () => {
      const leader = await seedLeader()

      await importSmallGroups([{
        mapped: { name: "Group G", leaderEmail: leader.email!, scheduleTime: "9:00" },
        resolution: "use-csv",
      }])

      const group = await db.smallGroup.findFirst({ where: { name: "Group G" } })
      expect(group?.scheduleTimeStart).toBe("09:00")
    })

    it("saves null when scheduleTime is not provided", async () => {
      const leader = await seedLeader()

      await importSmallGroups([{
        mapped: { name: "Group H", leaderEmail: leader.email! },
        resolution: "use-csv",
      }])

      const group = await db.smallGroup.findFirst({ where: { name: "Group H" } })
      expect(group?.scheduleTimeStart).toBeNull()
    })
  })

  describe("integration: both schedule fields saved together", () => {
    it("saves both scheduleDayOfWeek and scheduleTimeStart in one import", async () => {
      const leader = await seedLeader()

      await importSmallGroups([{
        mapped: {
          name: "Group I",
          leaderEmail: leader.email!,
          scheduleDayOfWeek: "Friday",
          scheduleTime: "19:30",
        },
        resolution: "use-csv",
      }])

      const group = await db.smallGroup.findFirst({ where: { name: "Group I" } })
      expect(group?.scheduleDayOfWeek).toBe(5)
      expect(group?.scheduleTimeStart).toBe("19:30")
    })
  })

  describe("regression: other import fields still work", () => {
    it("imports name, language, and meetingFormat alongside schedule fields", async () => {
      const leader = await seedLeader()

      await importSmallGroups([{
        mapped: {
          name: "Group J",
          leaderEmail: leader.email!,
          language: "English",
          meetingFormat: "Hybrid",
          scheduleDayOfWeek: "2",
          scheduleTime: "14:00",
        },
        resolution: "use-csv",
      }])

      const group = await db.smallGroup.findFirst({ where: { name: "Group J" } })
      expect(group?.language).toEqual(["English"])
      expect(group?.meetingFormat).toBe("Hybrid")
      expect(group?.scheduleDayOfWeek).toBe(2)
      expect(group?.scheduleTimeStart).toBe("14:00")
    })
  })

  describe("regression: leader creation without identifiers", () => {
    it("does not reuse a previously created leader when email and mobile are blank", async () => {
      const result = await importSmallGroups([
        {
          mapped: { name: "Group K" },
          resolution: "use-csv",
          createLeader: { type: "create", firstName: "", lastName: "" },
        },
        {
          mapped: { name: "Group L" },
          resolution: "use-csv",
          createLeader: { type: "create", firstName: "", lastName: "" },
        },
      ])

      expect(result.success).toBe(true)

      const groups = await db.smallGroup.findMany({
        where: { name: { in: ["Group K", "Group L"] } },
        select: { name: true, leaderId: true },
        orderBy: { name: "asc" },
      })

      expect(groups).toHaveLength(2)
      expect(groups[0].leaderId).not.toBe(groups[1].leaderId)
    })
  })
})
