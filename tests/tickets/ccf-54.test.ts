import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { db } from "@/lib/db"
import { FORM_FIELD_KEYS, FORM_SECTION_KEYS } from "@/lib/forms/context-config"
import { lookupMemberForRegistration, createRegistrant } from "@/app/(dashboard)/events/actions"

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
  await db.$executeRaw`TRUNCATE "EventRegistrant", "Guest", "Member", "Event", "LifeStage" RESTART IDENTITY CASCADE`
})

afterAll(async () => {
  await db.$disconnect()
})

async function seedEvent() {
  return db.event.create({
    data: { name: "Test Event", type: "OneTime", startDate: new Date(), endDate: new Date(),
      eventFormConfigs: FULLY_COLLECTING_FORM,
    },
    select: { id: true },
  })
}

async function seedMember(overrides: Partial<{ phone: string | null; email: string | null; lastName: string; birthMonth: number; birthYear: number }> = {}) {
  return db.member.create({
    data: {
      firstName: "Juan",
      lastName: overrides.lastName ?? "dela Cruz",
      email: overrides.email ?? null,
      phone: overrides.phone ?? null,
      birthMonth: overrides.birthMonth ?? null,
      birthYear: overrides.birthYear ?? null,
      dateJoined: new Date(),
      language: [],
    },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  })
}

describe("CCF-54 – record matching during event registration", () => {
  describe("unit – lookupMemberForRegistration", () => {
    it("matches member by mobile number", async () => {
      const member = await seedMember({ phone: "+63 917 123 4567" })
      const result = await lookupMemberForRegistration({ mobileNumber: "+63 917 123 4567" })
      expect(result).not.toBeNull()
      if (!result || 'matchType' in result) return
      expect(result.id).toBe(member.id)
      expect(result.matchedBy).toBe("mobile")
    })

    it("matches member by email when no mobile match", async () => {
      const member = await seedMember({ email: "juan@example.com" })
      const result = await lookupMemberForRegistration({
        mobileNumber: "+63 900 999 9999", // no match
        email: "juan@example.com",
      })
      expect(result).not.toBeNull()
      if (!result || 'matchType' in result) return
      expect(result.id).toBe(member.id)
      expect(result.matchedBy).toBe("email")
    })

    it("matches member by last name + birthday when no mobile or email match", async () => {
      const member = await seedMember({
        lastName: "Santos",
        birthMonth: 3,
        birthYear: 1990,
      })
      const result = await lookupMemberForRegistration({
        lastName: "Santos",
        birthMonth: 3,
        birthYear: 1990,
      })
      expect(result).not.toBeNull()
      if (!result || 'matchType' in result) return
      expect(result.id).toBe(member.id)
      expect(result.matchedBy).toBe("nameBirthday")
    })

    it("prefers mobile match over email match", async () => {
      const memberByPhone = await seedMember({ phone: "+63 917 123 4567", email: null })
      await seedMember({ email: "juan@example.com", phone: null })

      const result = await lookupMemberForRegistration({
        mobileNumber: "+63 917 123 4567",
        email: "juan@example.com",
      })
      if (!result || 'matchType' in result) return
      expect(result.id).toBe(memberByPhone.id)
      expect(result.matchedBy).toBe("mobile")
    })

    it("returns null when no match found", async () => {
      const result = await lookupMemberForRegistration({
        mobileNumber: "+63 900 000 0000",
        email: "nobody@example.com",
        lastName: "Unknown",
        birthMonth: 1,
        birthYear: 2000,
      })
      expect(result).toBeNull()
    })

    it("does not match by name+birthday when birthday is incomplete", async () => {
      await seedMember({ lastName: "Santos", birthMonth: 3, birthYear: 1990 })
      // birthYear missing
      const result = await lookupMemberForRegistration({
        lastName: "Santos",
        birthMonth: 3,
        birthYear: null,
      })
      expect(result).toBeNull()
    })
  })

  describe("integration – createRegistrant guest deduplication", () => {
    it("reuses existing guest when email matches and no phone provided", async () => {
      const event = await seedEvent()
      const existingGuest = await db.guest.create({
        data: { firstName: "Ana", lastName: "Reyes", email: "ana@example.com", language: [] },
        select: { id: true },
      })

      const result = await createRegistrant(
        event.id,
        {
          firstName: "Ana",
          lastName: "Reyes",
          email: "ana@example.com",
          mobileNumber: null,
          language: [],
        },
        null
      )

      expect(result.success).toBe(true)
      if (!result.success) return

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: result.data.id },
        select: { guestId: true },
      })
      expect(registrant?.guestId).toBe(existingGuest.id)

      // Ensure no duplicate guest was created
      const guestCount = await db.guest.count({ where: { email: "ana@example.com" } })
      expect(guestCount).toBe(1)
    })

    it("saves birthMonth and birthYear on new guest", async () => {
      const event = await seedEvent()
      const result = await createRegistrant(
        event.id,
        {
          firstName: "Ben",
          lastName: "Cruz",
          email: "ben@example.com",
          mobileNumber: null,
          birthMonth: 6,
          birthYear: 1995,
          language: [],
        },
        null
      )

      expect(result.success).toBe(true)
      if (!result.success) return

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: result.data.id },
        select: { guest: { select: { birthMonth: true, birthYear: true } } },
      })
      expect(registrant?.guest?.birthMonth).toBe(6)
      expect(registrant?.guest?.birthYear).toBe(1995)
    })

    it("reuses existing guest matched by last name + birthday", async () => {
      const event = await seedEvent()
      const existingGuest = await db.guest.create({
        data: { firstName: "Carlo", lastName: "Bautista", birthMonth: 9, birthYear: 1988, language: [] },
        select: { id: true },
      })

      const result = await createRegistrant(
        event.id,
        {
          firstName: "Carlo",
          lastName: "Bautista",
          email: null,
          mobileNumber: null,
          birthMonth: 9,
          birthYear: 1988,
          language: [],
        },
        null
      )

      expect(result.success).toBe(true)
      if (!result.success) return

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: result.data.id },
        select: { guestId: true },
      })
      expect(registrant?.guestId).toBe(existingGuest.id)
    })
  })

  describe("regression – original mobile matching still works", () => {
    it("still deduplicates guests by phone number", async () => {
      const event = await seedEvent()
      const existingGuest = await db.guest.create({
        data: { firstName: "Diego", lastName: "Tan", phone: "+63 918 123 4567", language: [] },
        select: { id: true },
      })

      const result = await createRegistrant(
        event.id,
        {
          firstName: "Diego",
          lastName: "Tan",
          mobileNumber: "+63 918 123 4567",
          email: null,
          language: [],
        },
        null
      )

      expect(result.success).toBe(true)
      if (!result.success) return

      const registrant = await db.eventRegistrant.findUnique({
        where: { id: result.data.id },
        select: { guestId: true },
      })
      expect(registrant?.guestId).toBe(existingGuest.id)
    })
  })
})

