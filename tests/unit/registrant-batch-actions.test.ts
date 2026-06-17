import { describe, it, expect, beforeEach, afterAll, vi } from "vitest"

import { db } from "@/lib/db"
import {
  deleteRegistrantsBatch,
  setRegistrantsAttendanceBatch,
} from "@/app/(event)/event/[id]/registrants/batch-actions"

beforeEach(async () => {
  vi.clearAllMocks()
  await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "EventOccurrence", "EventRegistrant", "Event", "Guest", "Member" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent(name = "Retreat") {
  return db.event.create({
    data: { name, type: "OneTime", startDate: new Date(), endDate: new Date() },
  })
}

// Minimal walk-in style registrant: personal fields only, no member/guest link.
async function seedRegistrant(
  eventId: string,
  opts?: { firstName?: string; lastName?: string; attendedAt?: Date | null }
) {
  return db.eventRegistrant.create({
    data: {
      eventId,
      firstName: opts?.firstName ?? "Reggie",
      lastName: opts?.lastName ?? "Strant",
      attendedAt: opts?.attendedAt ?? null,
    },
  })
}

describe("deleteRegistrantsBatch", () => {
  it("removes the selected registrants and reports the count", async () => {
    const event = await seedEvent()
    const r1 = await seedRegistrant(event.id)
    const r2 = await seedRegistrant(event.id)

    const result = await deleteRegistrantsBatch(event.id, [r1.id, r2.id])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.deleted).toBe(2)
      expect(result.data.failed).toHaveLength(0)
    }
    expect(await db.eventRegistrant.count({ where: { eventId: event.id } })).toBe(0)
  })

  it("ignores registrants belonging to another event", async () => {
    const eventA = await seedEvent("A")
    const eventB = await seedEvent("B")
    const rA = await seedRegistrant(eventA.id)
    const rB = await seedRegistrant(eventB.id)

    const result = await deleteRegistrantsBatch(eventA.id, [rA.id, rB.id])

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.deleted).toBe(1)
    // The foreign-event registrant is untouched.
    expect(await db.eventRegistrant.findUnique({ where: { id: rB.id } })).not.toBeNull()
    expect(await db.eventRegistrant.findUnique({ where: { id: rA.id } })).toBeNull()
  })

  it("no-ops on an empty id list", async () => {
    const event = await seedEvent()
    await seedRegistrant(event.id)

    const result = await deleteRegistrantsBatch(event.id, [])

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.deleted).toBe(0)
    expect(await db.eventRegistrant.count({ where: { eventId: event.id } })).toBe(1)
  })
})

describe("setRegistrantsAttendanceBatch", () => {
  it("marks the selected registrants as attended", async () => {
    const event = await seedEvent()
    const r1 = await seedRegistrant(event.id)
    const r2 = await seedRegistrant(event.id)

    const result = await setRegistrantsAttendanceBatch(event.id, [r1.id, r2.id], true)

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.updated).toBe(2)
    expect((await db.eventRegistrant.findUnique({ where: { id: r1.id } }))?.attendedAt).not.toBeNull()
    expect((await db.eventRegistrant.findUnique({ where: { id: r2.id } }))?.attendedAt).not.toBeNull()
  })

  it("clears attendance when marking as absent", async () => {
    const event = await seedEvent()
    const r = await seedRegistrant(event.id, { attendedAt: new Date() })

    const result = await setRegistrantsAttendanceBatch(event.id, [r.id], false)

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.updated).toBe(1)
    expect((await db.eventRegistrant.findUnique({ where: { id: r.id } }))?.attendedAt).toBeNull()
  })

  it("ignores registrants belonging to another event", async () => {
    const eventA = await seedEvent("A")
    const eventB = await seedEvent("B")
    const rA = await seedRegistrant(eventA.id)
    const rB = await seedRegistrant(eventB.id)

    const result = await setRegistrantsAttendanceBatch(eventA.id, [rA.id, rB.id], true)

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.updated).toBe(1)
    expect((await db.eventRegistrant.findUnique({ where: { id: rB.id } }))?.attendedAt).toBeNull()
  })
})
