import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { createRegistrant } from "@/app/(dashboard)/events/actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventRegistrant", "Guest", "Event" RESTART IDENTITY CASCADE`
})
afterAll(async () => {
  await db.$disconnect()
})

async function makeEvent(
  registrationStart: Date | null,
  registrationEnd: Date | null
) {
  const event = await db.event.create({
    data: {
      name: "Windowed OneTime",
      type: "OneTime",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-09-01"),
      registrationStart,
      registrationEnd,
    },
    select: { id: true },
  })
  return event.id
}

const attendee = { firstName: "Win", lastName: "Dow", mobileNumber: "09170000001" }

describe("createRegistrant registration-window enforcement", () => {
  it("accepts a public registration when no window is set", async () => {
    const eventId = await makeEvent(null, null)
    const res = await createRegistrant(eventId, attendee, null)
    expect(res.success).toBe(true)
  })

  it("rejects a public registration after registrationEnd has passed", async () => {
    const eventId = await makeEvent(new Date("2026-01-01"), new Date("2026-01-02"))
    const res = await createRegistrant(eventId, attendee, null)
    expect(res.success).toBe(false)
    expect(await db.eventRegistrant.count()).toBe(0)
  })

  it("rejects a public registration before registrationStart", async () => {
    const eventId = await makeEvent(new Date("2099-01-01"), null)
    const res = await createRegistrant(eventId, attendee, null)
    expect(res.success).toBe(false)
  })

  it("still allows a walk-in after registrationEnd (door is staff-supervised)", async () => {
    const eventId = await makeEvent(new Date("2026-01-01"), new Date("2026-01-02"))
    const res = await createRegistrant(
      eventId,
      attendee,
      null, null, false, null,
      { occurrenceId: null } // OneTime walk-in
    )
    expect(res.success).toBe(true)
    const reg = await db.eventRegistrant.findFirst()
    expect(reg?.attendedAt).not.toBeNull()
  })
})
