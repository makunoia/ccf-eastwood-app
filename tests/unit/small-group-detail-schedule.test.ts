import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { getSmallGroupDetails } from "@/app/(dashboard)/guests/matching-actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "SmallGroup", "Member" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

describe("getSmallGroupDetails — schedule", () => {
  it("returns the full schedule window, including the end time", async () => {
    const group = await db.smallGroup.create({
      data: {
        name: "Tuesday Night",
        scheduleDayOfWeek: 2,
        scheduleTimeStart: "19:00",
        scheduleTimeEnd: "21:00",
      },
    })

    const res = await getSmallGroupDetails(group.id)

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.scheduleDayOfWeek).toBe(2)
    expect(res.data.scheduleTimeStart).toBe("19:00")
    // Regression: scheduleTimeEnd was absent from the Prisma select, so the
    // match-result drawer rendered a start time with no end.
    expect(res.data.scheduleTimeEnd).toBe("21:00")
  })

  it("returns null end time when the group only has a start time", async () => {
    const group = await db.smallGroup.create({
      data: {
        name: "Open Ended",
        scheduleDayOfWeek: 0,
        scheduleTimeStart: "09:00",
      },
    })

    const res = await getSmallGroupDetails(group.id)

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.scheduleTimeStart).toBe("09:00")
    expect(res.data.scheduleTimeEnd).toBeNull()
  })

  it("returns nulls for a group with no schedule set", async () => {
    const group = await db.smallGroup.create({ data: { name: "Unscheduled" } })

    const res = await getSmallGroupDetails(group.id)

    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.scheduleDayOfWeek).toBeNull()
    expect(res.data.scheduleTimeStart).toBeNull()
    expect(res.data.scheduleTimeEnd).toBeNull()
  })
})
