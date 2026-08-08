/**
 * Ticket verification suite for CCF-59.
 * Newly provided information during registration should also update the member/guest record.
 *
 * Run locally:  pnpm verify:ticket CCF-59
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { FORM_FIELD_KEYS, FORM_SECTION_KEYS } from "@/lib/forms/context-config"
import { createRegistrant } from "@/app/(dashboard)/events/actions"

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
  await db.$executeRaw`TRUNCATE "EventRegistrant", "Event", "Member", "Guest", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent() {
  return db.event.create({
    data: {
      name: "Test Event",
      type: "OneTime",
      startDate: new Date(),
      endDate: new Date(),
      eventFormConfigs: FULLY_COLLECTING_FORM,
    },
    select: { id: true },
  })
}

async function seedMember(overrides: Partial<{ email: string; phone: string }> = {}) {
  return db.member.create({
    data: {
      firstName: "Jane",
      lastName: "Doe",
      phone: overrides.phone ?? "+63 911 111 1111",
      email: overrides.email ?? null,
      language: [],
      dateJoined: new Date(),
    },
  })
}

async function seedGuest(overrides: Partial<{ email: string; phone: string }> = {}) {
  return db.guest.create({
    data: {
      firstName: "John",
      lastName: "Guest",
      phone: overrides.phone ?? "+63 922 222 2222",
      email: overrides.email ?? null,
      language: [],
    },
  })
}

const baseFormData = {
  firstName: "Jane",
  lastName: "Doe",
  nickname: null,
  mobileNumber: "+63 933 333 3333",
  email: "jane.doe@example.com",
  birthMonth: 4,
  birthYear: 1995,
  lifeStageId: null,
  gender: "Female" as const,
  language: ["English"],
  meetingPreference: "InPerson" as const,
  workCity: "Makati",
  scheduleDayOfWeek: 0,
  scheduleTimeStart: "10:00",
}

describe("CCF-59 — registration fills in missing member/guest fields", () => {
  describe("integration", () => {
    it("fills in null fields on a member record when form provides them", async () => {
      const event = await seedEvent()
      // Member has no email or matching fields set
      const member = await seedMember({ phone: "+63 911 111 1111" })

      const result = await createRegistrant(event.id, baseFormData, member.id, null)
      expect(result.success).toBe(true)

      const updated = await db.member.findUnique({ where: { id: member.id } })
      // These were null on the member — form data should fill them in
      expect(updated?.email).toBe("jane.doe@example.com")
      expect(updated?.gender).toBe("Female")
      expect(updated?.language).toEqual(["English"])
      expect(updated?.meetingPreference).toBe("InPerson")
      expect(updated?.workCity).toBe("Makati")
      expect(updated?.birthMonth).toBe(4)
      expect(updated?.birthYear).toBe(1995)
    })

    it("does not overwrite existing member fields even if form provides different values", async () => {
      const event = await seedEvent()
      // Member already has these fields populated
      const member = await db.member.create({
        data: {
          firstName: "Jane",
          lastName: "Doe",
          phone: "+63 911 111 1111",
          email: "existing@example.com",
          gender: "Female",
          language: ["Filipino"],
          meetingPreference: "Online",
          workCity: "BGC",
          birthMonth: 1,
          birthYear: 1990,
          dateJoined: new Date(),
        },
      })

      const result = await createRegistrant(event.id, baseFormData, member.id, null)
      expect(result.success).toBe(true)

      const updated = await db.member.findUnique({ where: { id: member.id } })
      // All existing values must be preserved — form values ignored
      expect(updated?.email).toBe("existing@example.com")
      expect(updated?.gender).toBe("Female")
      expect(updated?.language).toEqual(["Filipino"])
      expect(updated?.meetingPreference).toBe("Online")
      expect(updated?.workCity).toBe("BGC")
      expect(updated?.birthMonth).toBe(1)
      expect(updated?.birthYear).toBe(1990)
    })

    it("fills in null fields on a guest record when form provides them", async () => {
      const event = await seedEvent()
      // Guest has no email or matching fields set
      const guest = await seedGuest({ phone: "+63 922 222 2222" })

      const result = await createRegistrant(event.id, baseFormData, null, guest.id)
      expect(result.success).toBe(true)

      const updated = await db.guest.findUnique({ where: { id: guest.id } })
      expect(updated?.email).toBe("jane.doe@example.com")
      expect(updated?.gender).toBe("Female")
      expect(updated?.language).toEqual(["English"])
      expect(updated?.meetingPreference).toBe("InPerson")
      expect(updated?.workCity).toBe("Makati")
      expect(updated?.birthMonth).toBe(4)
      expect(updated?.birthYear).toBe(1995)
      expect(updated?.scheduleDayOfWeek).toBe(0)
      expect(updated?.scheduleTimeStart).toBe("10:00")
    })

    it("does not overwrite existing guest fields even if form provides different values", async () => {
      const event = await seedEvent()
      // Guest already has these fields populated
      const guest = await db.guest.create({
        data: {
          firstName: "John",
          lastName: "Guest",
          phone: "+63 922 222 2222",
          email: "existing-guest@example.com",
          gender: "Male",
          language: ["Filipino"],
          meetingPreference: "Online",
          workCity: "Quezon City",
          birthMonth: 6,
          birthYear: 1992,
          scheduleDayOfWeek: 3,
          scheduleTimeStart: "18:00",
        },
      })

      const result = await createRegistrant(event.id, baseFormData, null, guest.id)
      expect(result.success).toBe(true)

      const updated = await db.guest.findUnique({ where: { id: guest.id } })
      // All existing values must be preserved — form values ignored
      expect(updated?.email).toBe("existing-guest@example.com")
      expect(updated?.gender).toBe("Male")
      expect(updated?.language).toEqual(["Filipino"])
      expect(updated?.meetingPreference).toBe("Online")
      expect(updated?.workCity).toBe("Quezon City")
      expect(updated?.birthMonth).toBe(6)
      expect(updated?.birthYear).toBe(1992)
      expect(updated?.scheduleDayOfWeek).toBe(3)
      expect(updated?.scheduleTimeStart).toBe("18:00")
    })

    it("still creates registrant even when no updatable fields are provided", async () => {
      const event = await seedEvent()
      const member = await seedMember()

      const sparseData = {
        firstName: "Jane",
        lastName: "Doe",
        nickname: null,
        mobileNumber: null,
        email: null,
        birthMonth: null,
        birthYear: null,
        lifeStageId: null,
        gender: null,
        language: [],
        meetingPreference: null,
        workCity: null,
        scheduleDayOfWeek: null,
        scheduleTimeStart: null,
      }
      const result = await createRegistrant(event.id, sparseData, member.id, null)
      expect(result.success).toBe(true)

      const registrant = await db.eventRegistrant.findFirst({ where: { eventId: event.id } })
      expect(registrant?.memberId).toBe(member.id)
    })
  })

  describe("regression", () => {
    it("existing non-confirmed (new guest) registration flow still works", async () => {
      const event = await seedEvent()
      const data = {
        firstName: "New",
        lastName: "Person",
        nickname: null,
        mobileNumber: "+63 950 000 0001",
        email: null,
        birthMonth: null,
        birthYear: null,
        lifeStageId: null,
        gender: null,
        language: [],
        meetingPreference: null,
        workCity: null,
        scheduleDayOfWeek: null,
        scheduleTimeStart: null,
      }

      const result = await createRegistrant(event.id, data, null, null)
      expect(result.success).toBe(true)

      const guest = await db.guest.findFirst({ where: { phone: "+63 950 000 0001" } })
      expect(guest).not.toBeNull()
    })
  })
})
