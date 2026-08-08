import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { FORM_FIELD_KEYS, FORM_SECTION_KEYS } from "@/lib/forms/context-config"
import { createRegistrant } from "@/app/(dashboard)/events/actions"

// CCF-15 originally covered the standalone `walkInCheckin` action. Walk-in
// registration now goes through `createRegistrant(..., walkIn)` so the kiosk
// flow has full parity with public registration; these tests pin the same
// walk-in behaviors against the unified action.

/**
 * Every section and field enabled. `createRegistrant` enforces the form config
 * server-side, so a test that submits optional fields has to be registering
 * against an event whose form actually collects them. Options like
 * `familySpouseOnly` stay off — they restrict a section rather than enable one.
 */
const ALL_FORM_TOGGLES = Object.fromEntries(
  [...FORM_SECTION_KEYS, ...FORM_FIELD_KEYS].map((k) => [k, true])
)

const FULLY_COLLECTING_FORM = {
  create: (["Register", "WalkIn", "CheckIn"] as const).map((context) => ({
    context,
    ...ALL_FORM_TOGGLES,
  })),
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE "OccurrenceAttendee", "EventRegistrant", "Guest", "EventOccurrence", "EventMinistry", "Event", "Ministry", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedOneTimeEvent() {
  return db.event.create({
    data: {
      name: "Test Event",
      type: "OneTime",
      startDate: new Date(),
      endDate: new Date(),
      formIncludePayment: true,
      eventFormConfigs: FULLY_COLLECTING_FORM,
    },
    select: { id: true },
  })
}

function walkInPayload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: "John",
    lastName: "Doe",
    nickname: null,
    email: null,
    mobileNumber: "+63 917 123 4567",
    gender: null,
    birthMonth: null,
    birthYear: null,
    paymentReference: null,
    ...overrides,
  }
}

async function walkIn(
  eventId: string,
  payload: Record<string, unknown>,
  occurrenceId: string | null = null
) {
  return createRegistrant(eventId, walkInPayload(payload), null, null, false, null, {
    occurrenceId,
  })
}

describe("CCF-15: Walk-In Registration", () => {
  describe("unit", () => {
    it("walk-in registration returns success with registrant id", async () => {
      const event = await seedOneTimeEvent()
      const result = await walkIn(event.id, {})
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBeTruthy()
      }
    })
  })

  describe("integration", () => {
    it("creates a Guest and EventRegistrant with gender and birth fields", async () => {
      const event = await seedOneTimeEvent()
      const result = await walkIn(event.id, {
        firstName: "Jane",
        lastName: "Smith",
        mobileNumber: "+63 918 765 4321",
        gender: "Female",
        birthMonth: 6,
        birthYear: 1995,
      })
      expect(result.success).toBe(true)
      if (!result.success) return

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: result.data.id },
        include: { guest: true },
      })
      expect(registrant).not.toBeNull()
      expect(registrant?.guest?.gender).toBe("Female")
      expect(registrant?.guest?.birthMonth).toBe(6)
      expect(registrant?.guest?.birthYear).toBe(1995)
    })

    it("immediately checks in: sets attendedAt for OneTime events", async () => {
      const event = await seedOneTimeEvent()
      const result = await walkIn(event.id, {
        firstName: "Alice",
        lastName: "Walker",
        mobileNumber: "+63 919 222 2222",
      })
      expect(result.success).toBe(true)
      if (!result.success) return

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: result.data.id },
      })
      expect(registrant?.attendedAt).not.toBeNull()
    })

    it("reuses existing Guest by mobile number on second walk-in", async () => {
      const event1 = await seedOneTimeEvent()
      const event2 = await seedOneTimeEvent()

      const mobile = "+63 919 333 3333"

      await walkIn(event1.id, {
        firstName: "Chris",
        lastName: "Cross",
        mobileNumber: mobile,
        gender: "Male",
      })

      const result2 = await walkIn(event2.id, {
        firstName: "Chris",
        lastName: "Cross",
        mobileNumber: mobile,
      })
      expect(result2.success).toBe(true)

      const guests = await db.guest.findMany({ where: { phone: mobile } })
      expect(guests.length).toBe(1)
    })
  })

  describe("regression", () => {
    it("does not clear existing gender/birth on Guest if new walk-in leaves them blank", async () => {
      const event1 = await seedOneTimeEvent()
      const event2 = await seedOneTimeEvent()
      const mobile = "+63 919 444 4444"

      await walkIn(event1.id, {
        firstName: "Dana",
        lastName: "Fields",
        mobileNumber: mobile,
        gender: "Female",
        birthMonth: 3,
        birthYear: 2000,
      })

      await walkIn(event2.id, {
        firstName: "Dana",
        lastName: "Fields",
        mobileNumber: mobile,
      })

      const guest = await db.guest.findFirst({ where: { phone: mobile } })
      expect(guest?.gender).toBe("Female")
      expect(guest?.birthMonth).toBe(3)
      expect(guest?.birthYear).toBe(2000)
    })
  })
})
