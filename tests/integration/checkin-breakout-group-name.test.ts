import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { getRegistrantBreakoutGroupName } from "@/app/(dashboard)/events/breakout-actions"

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "BreakoutGroupMember", "BreakoutGroup", "EventRegistrant", "Event", "Member", "Guest" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent() {
  return db.event.create({
    data: { name: "Event", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
}

describe("getRegistrantBreakoutGroupName", () => {
  it("returns the breakout group name for an assigned registrant", async () => {
    const event = await seedEvent()
    const guest = await db.guest.create({
      data: { firstName: "Gina", lastName: "Guest", language: [] },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })
    const group = await db.breakoutGroup.create({
      data: { name: "Table 7", eventId: event.id },
    })
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: group.id, registrantId: registrant.id },
    })

    const result = await getRegistrantBreakoutGroupName(registrant.id, event.id)
    expect(result).toEqual({ name: "Table 7" })
  })

  it("returns null when the registrant has no breakout assignment", async () => {
    const event = await seedEvent()
    const guest = await db.guest.create({
      data: { firstName: "Una", lastName: "Assigned", language: [] },
    })
    const registrant = await db.eventRegistrant.create({
      data: { eventId: event.id, guestId: guest.id },
    })

    const result = await getRegistrantBreakoutGroupName(registrant.id, event.id)
    expect(result).toBeNull()
  })

  it("does not return a breakout group from a different event", async () => {
    const eventA = await seedEvent()
    const eventB = await seedEvent()
    const guest = await db.guest.create({
      data: { firstName: "Cross", lastName: "Event", language: [] },
    })
    // Same person registered for both events; assigned only in event A.
    const regA = await db.eventRegistrant.create({
      data: { eventId: eventA.id, guestId: guest.id },
    })
    const regB = await db.eventRegistrant.create({
      data: { eventId: eventB.id, guestId: guest.id },
    })
    const groupA = await db.breakoutGroup.create({
      data: { name: "A-Table", eventId: eventA.id },
    })
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: groupA.id, registrantId: regA.id },
    })

    expect(await getRegistrantBreakoutGroupName(regA.id, eventA.id)).toEqual({ name: "A-Table" })
    // regB is in event B and unassigned there — must not leak event A's group.
    expect(await getRegistrantBreakoutGroupName(regB.id, eventB.id)).toBeNull()
  })
})
