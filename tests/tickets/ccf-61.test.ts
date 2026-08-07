import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { createRegistrant } from "@/app/(dashboard)/events/actions"

const baseRegistrantInput = {
  firstName: "Test",
  lastName: "User",
  nickname: null,
  email: "test@example.com",
  mobileNumber: "+639171234567",
  birthMonth: 5,
  birthYear: 1990,
  lifeStageId: null,
  gender: null as "Male" | "Female" | null,
  language: [],
  meetingPreference: null as "Online" | "Hybrid" | "InPerson" | null,
  workCity: null,
  scheduleDayOfWeek: null,
  scheduleTimeStart: null,
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "EventRegistrant", "OccurrenceAttendee", "Guest", "Member", "Event", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent() {
  return db.event.create({
    data: {
      name: "Test Event",
      type: "OneTime",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-01"),
    },
    select: { id: true },
  })
}

async function seedMember(overrides: Partial<Parameters<typeof db.member.create>[0]["data"]> = {}) {
  return db.member.create({
    data: {
      firstName: "John",
      lastName: "Doe",
      dateJoined: new Date(),
      phone: "+639170000001",
      language: [],
      ...overrides,
    },
    select: { id: true },
  })
}

async function seedGuest(overrides: Partial<Parameters<typeof db.guest.create>[0]["data"]> = {}) {
  return db.guest.create({
    data: {
      firstName: "Jane",
      lastName: "Doe",
      phone: "+639180000001",
      language: [],
      ...overrides,
    },
    select: { id: true },
  })
}

/**
 * Ticket: CCF-61 — Registrants should not be able to register twice.
 */
describe("CCF-61 – Prevent duplicate event registration", () => {
  describe("integration", () => {
    it("prevents a confirmed member from registering for the same event twice", async () => {
      const event = await seedEvent()
      const member = await seedMember()

      // First registration should succeed
      const first = await createRegistrant(event.id, { ...baseRegistrantInput }, member.id, null)
      expect(first.success).toBe(true)

      // Second registration with same member should fail
      const second = await createRegistrant(event.id, { ...baseRegistrantInput }, member.id, null)
      expect(second.success).toBe(false)
      if (!second.success) {
        expect(second.error).toMatch(/already registered/i)
      }
    })

    it("prevents a confirmed guest from registering for the same event twice", async () => {
      const event = await seedEvent()
      const guest = await seedGuest()

      // First registration should succeed
      const first = await createRegistrant(event.id, { ...baseRegistrantInput }, null, guest.id)
      expect(first.success).toBe(true)

      // Second registration with same guest should fail
      const second = await createRegistrant(event.id, { ...baseRegistrantInput }, null, guest.id)
      expect(second.success).toBe(false)
      if (!second.success) {
        expect(second.error).toMatch(/already registered/i)
      }
    })

    it("prevents a non-member (new guest path) from registering for the same event twice via same phone number", async () => {
      const event = await seedEvent()

      // First registration — creates a guest record
      const first = await createRegistrant(event.id, { ...baseRegistrantInput }, null)
      expect(first.success).toBe(true)

      // Second registration with same phone — finds the same guest → duplicate
      const second = await createRegistrant(event.id, { ...baseRegistrantInput }, null)
      expect(second.success).toBe(false)
      if (!second.success) {
        expect(second.error).toMatch(/already registered/i)
      }
    })
  })

  describe("regression", () => {
    it("allows the same person to register for different events", async () => {
      const event1 = await seedEvent()
      const event2 = await db.event.create({
        data: {
          name: "Second Event",
          type: "OneTime",
          startDate: new Date("2026-07-01"),
          endDate: new Date("2026-07-01"),
        },
        select: { id: true },
      })
      const member = await seedMember()

      const first = await createRegistrant(event1.id, { ...baseRegistrantInput }, member.id, null)
      expect(first.success).toBe(true)

      // Same member can register for a different event
      const second = await createRegistrant(event2.id, { ...baseRegistrantInput }, member.id, null)
      expect(second.success).toBe(true)
    })

    it("does not create a duplicate EventRegistrant record in the DB after the second attempt", async () => {
      const event = await seedEvent()
      const member = await seedMember()

      await createRegistrant(event.id, { ...baseRegistrantInput }, member.id, null)
      await createRegistrant(event.id, { ...baseRegistrantInput }, member.id, null)

      const count = await db.eventRegistrant.count({
        where: { eventId: event.id, memberId: member.id },
      })
      expect(count).toBe(1)
    })
  })
})
