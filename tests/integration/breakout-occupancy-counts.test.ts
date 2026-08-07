import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"
import { db } from "@/lib/db"
import { fetchBreakoutAvailability } from "@/lib/breakout-suggestion-server"
import { assignBreakoutForRegistrant } from "@/lib/events/registration-core"

/**
 * CCF-141 — occupancy shown on the registration picker and the session page has
 * to be the live roster, not a number that drifted from it.
 *
 * These tests move real `BreakoutGroupMember` rows and re-read the counts, and
 * they pin the one place capacity is now deliberately overridable: an explicit
 * pick at the staffed door may go over the limit, the same pick from the public
 * form may not.
 */

beforeEach(async () => {
  vi.clearAllMocks()
  await db.$executeRaw`TRUNCATE "BreakoutGroupMember", "BreakoutGroup", "EventModule", "EventRegistrant", "EventOccurrence", "Event", "Member", "Guest" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent() {
  const event = await db.event.create({
    data: { name: "Retreat", type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
  // Breakout placement is module-gated (CCF-128) — without this nothing assigns.
  await db.eventModule.create({ data: { eventId: event.id, type: "Breakout" } })
  return event
}

function seedGroup(eventId: string, name: string, memberLimit: number | null) {
  return db.breakoutGroup.create({ data: { eventId, name, memberLimit } })
}

async function seedRegistrant(eventId: string, firstName: string) {
  return db.eventRegistrant.create({
    data: { eventId, firstName, lastName: "Tester" },
  })
}

/** The occupancy the picker would render for `name`. */
async function occupancyOf(eventId: string, name: string) {
  const { candidates } = await fetchBreakoutAvailability(eventId, null, false)
  return candidates.find((c) => c.name === name)
}

describe("breakout occupancy reflects real membership", () => {
  it("starts a fresh group empty", async () => {
    const event = await seedEvent()
    await seedGroup(event.id, "Alpha", 3)

    expect((await occupancyOf(event.id, "Alpha"))?.occupancy).toEqual({
      memberCount: 0,
      memberLimit: 3,
    })
  })

  it("moves the count as members are added and removed", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id, "Alpha", 3)
    const a = await seedRegistrant(event.id, "Ana")
    const b = await seedRegistrant(event.id, "Ben")

    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: group.id, registrantId: a.id },
    })
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: group.id, registrantId: b.id },
    })
    expect((await occupancyOf(event.id, "Alpha"))?.occupancy?.memberCount).toBe(2)

    await db.breakoutGroupMember.delete({
      where: { breakoutGroupId_registrantId: { breakoutGroupId: group.id, registrantId: b.id } },
    })
    expect((await occupancyOf(event.id, "Alpha"))?.occupancy?.memberCount).toBe(1)
  })

  it("flags a group as full once the roster reaches the limit", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id, "Alpha", 2)
    expect((await occupancyOf(event.id, "Alpha"))?.isFull).toBe(false)

    for (const name of ["Ana", "Ben"]) {
      const r = await seedRegistrant(event.id, name)
      await db.breakoutGroupMember.create({
        data: { breakoutGroupId: group.id, registrantId: r.id },
      })
    }
    expect((await occupancyOf(event.id, "Alpha"))?.isFull).toBe(true)
  })

  // Regression: an uncapped group must never read as full or as having zero room.
  it("never calls an uncapped group full, however many it holds", async () => {
    const event = await seedEvent()
    const group = await seedGroup(event.id, "Open", null)
    for (const name of ["Ana", "Ben", "Cyd"]) {
      const r = await seedRegistrant(event.id, name)
      await db.breakoutGroupMember.create({
        data: { breakoutGroupId: group.id, registrantId: r.id },
      })
    }

    const open = await occupancyOf(event.id, "Open")
    expect(open?.isFull).toBe(false)
    expect(open?.roomRatio).toBeNull()
    expect(open?.occupancy).toEqual({ memberCount: 3, memberLimit: null })
  })
})

describe("an explicit pick into a full group", () => {
  async function seedFullGroup() {
    const event = await seedEvent()
    const group = await seedGroup(event.id, "Alpha", 1)
    const sitting = await seedRegistrant(event.id, "Ana")
    await db.breakoutGroupMember.create({
      data: { breakoutGroupId: group.id, registrantId: sitting.id },
    })
    const incoming = await seedRegistrant(event.id, "Ben")
    return { event, group, incoming }
  }

  const noProfile = { gender: null, birthYear: null }

  it("is honoured at the door, where staff chose it on purpose", async () => {
    const { event, group, incoming } = await seedFullGroup()

    const assigned = await assignBreakoutForRegistrant(
      incoming.id,
      event.id,
      group.id,
      noProfile,
      true
    )

    expect(assigned).not.toBeNull()
    expect(await db.breakoutGroupMember.count({ where: { breakoutGroupId: group.id } })).toBe(2)
  })

  it("is refused on the public form, where the picker never offered it", async () => {
    const { event, group, incoming } = await seedFullGroup()

    const assigned = await assignBreakoutForRegistrant(
      incoming.id,
      event.id,
      group.id,
      noProfile,
      false
    )

    expect(assigned).toBeNull()
    expect(await db.breakoutGroupMember.count({ where: { breakoutGroupId: group.id } })).toBe(1)
  })

  it("reports the group as over capacity once the door override lands", async () => {
    const { event, group, incoming } = await seedFullGroup()
    await assignBreakoutForRegistrant(incoming.id, event.id, group.id, noProfile, true)

    const alpha = await occupancyOf(event.id, "Alpha")
    expect(alpha?.occupancy).toEqual({ memberCount: 2, memberLimit: 1 })
    expect(alpha?.isFull).toBe(true)
  })
})
