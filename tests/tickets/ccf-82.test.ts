import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { setRegistrationFormModule } from "@/app/(dashboard)/events/module-actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventModule", "EventMinistry", "Event", "Ministry" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent() {
  return db.event.create({
    data: {
      name: "Breakout Event",
      type: "OneTime",
      startDate: new Date(),
      endDate: new Date(),
    },
    select: { id: true },
  })
}

describe("CCF-82: Auto-assign Breakout setting", () => {
  describe("unit", () => {
    it("autoAssignBreakout defaults to false on new events", async () => {
      const event = await seedEvent()
      const fetched = await db.event.findUnique({
        where: { id: event.id },
        select: { autoAssignBreakout: true },
      })
      expect(fetched?.autoAssignBreakout).toBe(false)
    })
  })

  describe("integration", () => {
    it("setRegistrationFormModule enables AutoAssignBreakout", async () => {
      const event = await seedEvent()
      const result = await setRegistrationFormModule(event.id, "AutoAssignBreakout", true)
      expect(result.success).toBe(true)

      const fetched = await db.event.findUnique({
        where: { id: event.id },
        select: { autoAssignBreakout: true },
      })
      expect(fetched?.autoAssignBreakout).toBe(true)
    })

    it("setRegistrationFormModule disables AutoAssignBreakout", async () => {
      const event = await seedEvent()
      await db.event.update({
        where: { id: event.id },
        data: { autoAssignBreakout: true },
      })

      const result = await setRegistrationFormModule(event.id, "AutoAssignBreakout", false)
      expect(result.success).toBe(true)

      const fetched = await db.event.findUnique({
        where: { id: event.id },
        select: { autoAssignBreakout: true },
      })
      expect(fetched?.autoAssignBreakout).toBe(false)
    })

    it("AutoAssignBreakout toggle does not affect other form modules", async () => {
      const event = await seedEvent()
      await db.event.update({
        where: { id: event.id },
        data: { formIncludePayment: true, formIncludeSmallGroup: true },
      })

      await setRegistrationFormModule(event.id, "AutoAssignBreakout", true)

      const fetched = await db.event.findUnique({
        where: { id: event.id },
        select: {
          autoAssignBreakout: true,
          formIncludePayment: true,
          formIncludeSmallGroup: true,
        },
      })
      expect(fetched?.autoAssignBreakout).toBe(true)
      expect(fetched?.formIncludePayment).toBe(true)
      expect(fetched?.formIncludeSmallGroup).toBe(true)
    })
  })

  describe("regression", () => {
    it("setRegistrationFormModule returns error for unknown module", async () => {
      const event = await seedEvent()
      // @ts-expect-error intentionally passing invalid module
      const result = await setRegistrationFormModule(event.id, "Unknown", true)
      expect(result.success).toBe(false)
    })
  })
})
